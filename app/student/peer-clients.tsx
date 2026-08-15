import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {  ActivityIndicator,  Alert,  RefreshControl,  ScrollView,  StyleSheet,  Text,  TextInput,  TouchableOpacity,  View, Modal, Linking} from 'react-native';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { useProfile } from '@/api/Profile';
import { useAuth } from '@/providers/AuthProvider';
import { RefreshConfig } from '@/constants/RefreshConfig';

interface ClientSession {
  id: string;
  studentId: string;
  studentName: string;
  studentReg: string;
  session_date: string;
  session_time: string;
  booking_mode?: 'online' | 'offline';
  status: 'pending' | 'approved' | 'rejected' | 'complete';
  notes?: string;
  created_at: string;
}

interface ClientDetails extends ClientSession {
  studentEmail?: string;
  studentPhone?: string;
  studentType?: string;
}

export default function PeerClientsPage() {
  const router = useRouter();
  const {session } = useAuth();
  const {data: profile} = useProfile(session?.user.id);

  const [clients, setClients] = useState<ClientSession[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'complete'>('all');
  const [selectedClient, setSelectedClient] = useState<ClientDetails | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (profile) {
      loadClients();
    }
  }, [profile]);

  // Auto-refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (profile) {
        loadClients();
      }
    }, [profile])
  );

  // Setup auto-refresh interval (every 45 seconds) + Real-time subscription
  useEffect(() => {
    if (!profile) return;

    // Set up real-time subscription for instant updates
    const channel = supabase
      .channel(`peer_clients_${profile.registration_number}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'book_request',
          filter: `expert_registration_number=eq.${profile.registration_number}`,
        },
        (payload) => {
          console.log('Client session changed:', payload);
          // Reload data immediately on any change
          loadClients();
        }
      )
      .subscribe();

    // Also keep polling as backup (every 45 seconds)
    autoRefreshIntervalRef.current = setInterval(() => {
      loadClients();
    }, RefreshConfig.CLIENT_LIST_REFRESH_INTERVAL);

    return () => {
      supabase.removeChannel(channel);
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [profile]);

  useEffect(() => {
    filterClients();
  }, [clients, searchQuery, selectedFilter]);


  const loadClients = async () => {
    setLoading(true);
    try {
      // Load sessions where peer listener is the expert
      const { data, error } = await supabase
        .from('book_request')
        .select('*')
        .eq('expert_registration_number', profile?.registration_number)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading clients:', error);
        Alert.alert('Error', 'Failed to load client sessions');
        setClients([]);
      } else if (data) {
        const transformedClients: ClientSession[] = data.map(session => ({
          id: session.id?.toString() || `session_${Math.random()}`,
          studentId: session.student_id || '',
          studentName: session.user_name || session.student_name || 'Unknown Student',
          studentReg: session.student_registration_number?.toString() || 'N/A',
          session_date: session.session_date || '',
          session_time: session.session_time || '',
          booking_mode: session.booking_mode || undefined,
          status: session.status || 'pending',
          notes: session.notes || session.reason || '',
          created_at: session.created_at || ''
        }));
        setClients(transformedClients);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
      if (error instanceof Error && (error.message?.includes('network') || error.message?.includes('fetch') || error.message?.includes('Failed to fetch'))) {
        Alert.alert('Network Error', 'Unable to load clients. Please check your internet connection.');
      } else {
        Alert.alert('Error', 'An error occurred while loading clients');
      }
      setClients([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterClients = () => {
    let filtered = [...clients];

    // Filter by status
    if (selectedFilter !== 'all') {
      filtered = filtered.filter(c => c.status === selectedFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.studentName.toLowerCase().includes(q) ||
        c.studentReg.toLowerCase().includes(q) ||
        c.notes?.toLowerCase().includes(q)
      );
    }

    setFilteredClients(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClients();
  };

  const handleViewDetails = async (client: ClientSession) => {
    try {
      // Fetch additional user details from profiles table
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('email, type')
        .eq('registration_number', parseInt(client.studentReg))
        .maybeSingle();

      if (error) {
        console.error('Error fetching client details:', error);
      }

      // Combine client session data with profile data
      const clientDetails: ClientDetails = {
        ...client,
        studentEmail: profileData?.email,
        studentType: profileData?.type,
      };

      setSelectedClient(clientDetails);
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error:', err);
      Alert.alert('Error', 'Failed to load client details');
    }
  };

  const handleCallClient = (phoneNumber: string) => {
    if (!phoneNumber) {
      Alert.alert('No Phone Number', 'Phone number is not available for this client.');
      return;
    }

    Alert.alert(
      'Call Client',
      `Do you want to call ${phoneNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: async () => {
            const phoneUrl = `tel:${phoneNumber}`;
            const canOpen = await Linking.canOpenURL(phoneUrl);
            if (canOpen) {
              await Linking.openURL(phoneUrl);
            } else {
              Alert.alert('Error', 'Unable to make phone calls on this device');
            }
          }
        }
      ]
    );
  };

  const handleEmailClient = (email: string) => {
    if (!email) {
      Alert.alert('No Email', 'Email address is not available for this client.');
      return;
    }

    Alert.alert(
      'Email Client',
      `Do you want to send an email to ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Email',
          onPress: async () => {
            const emailUrl = `mailto:${email}`;
            const canOpen = await Linking.canOpenURL(emailUrl);
            if (canOpen) {
              await Linking.openURL(emailUrl);
            } else {
              Alert.alert('Error', 'Unable to open email client');
            }
          }
        }
      ]
    );
  };

  const handleMessageClient = (client: ClientDetails) => {
    console.log('Message client pressed with:', {
      studentId: client.studentId,
      studentName: client.studentName,
    });

    if (!client.studentId) {
      Alert.alert('Error', 'Cannot start chat. Student information is missing.');
      return;
    }

    // Navigate to chat page with client info
    router.push({
      pathname: '/student/chat',
      params: {
        participantId: client.studentId,
        participantName: client.studentName,
        participantType: 'STUDENT',
      }
    });
    setShowDetailsModal(false);
  };

  const handleApprove = async (clientId: string) => {
    Alert.alert(
      'Approve Session',
      'Are you sure you want to approve this session request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              // First, get the session details to update the student_schedule
              const { data: sessionData, error: fetchError } = await supabase
                .from('book_request')
                .select('*')
                .eq('id', clientId)
                .maybeSingle();

              if (fetchError) {
                console.error('Error fetching session details:', fetchError);
                Alert.alert('Error', 'Failed to fetch session details');
                return;
              }

              if (!sessionData) {
                Alert.alert('Error', 'Session not found');
                return;
              }

              // Convert session_time format (e.g., "09:00" or "09:00 AM") to database format
              const convertTimeToDBFormat = (timeStr: string): string => {
                // If already in HH:MM:SS format, return as is
                if (timeStr.match(/^\d{2}:\d{2}:\d{2}$/)) {
                  return timeStr;
                }
                // If in HH:MM format, add :00
                if (timeStr.match(/^\d{1,2}:\d{2}$/)) {
                  const [hours, minutes] = timeStr.split(':');
                  return `${hours.padStart(2, '0')}:${minutes}:00`;
                }
                return timeStr;
              };

              const sessionTimeFormatted = convertTimeToDBFormat(sessionData.session_time);
              const peerRegNum = parseInt(profile?.registration_number?.toString() || '0', 10);

              // Check if slot is still available in student_schedule
              const { data: availableSlots, error: slotCheckError } = await supabase
                .from('student_schedule')
                .select('*')
                .eq('peer_registration_number', peerRegNum)
                .eq('date', sessionData.session_date)
                .eq('is_available', true);

              if (slotCheckError) {
                console.error('Error checking slot availability:', slotCheckError);
                Alert.alert('Error', 'Failed to check slot availability');
                return;
              }

              // Find matching slot by time
              const matchingSlot = availableSlots?.find(slot => 
                slot.start_time === sessionTimeFormatted || 
                slot.start_time.substring(0, 5) === sessionData.session_time.substring(0, 5)
              );

              if (!matchingSlot) {
                Alert.alert(
                  'Slot Unavailable',
                  'This time slot is no longer available. It may have been booked by another student.',
                  [{ text: 'OK' }]
                );
                // Update the request to rejected since slot is not available
                await supabase
                  .from('book_request')
                  .update({ status: 'rejected' })
                  .eq('id', clientId);
                await loadClients();
                return;
              }

              // Approve the session in book_request
              const { error: approveError } = await supabase
                .from('book_request')
                .update({ status: 'approved' })
                .eq('id', clientId);

              if (approveError) {
                console.error('Error approving session:', approveError);
                Alert.alert('Error', 'Failed to approve session');
                return;
              }

              // Update the slot in student_schedule to mark as booked
              const { error: updateSlotError } = await supabase
                .from('student_schedule')
                .update({ 
                  is_available: false,
                  booked_by: sessionData.student_id
                })
                .eq('id', matchingSlot.id);

              if (updateSlotError) {
                console.error('Error updating slot availability:', updateSlotError);
                // Rollback the approval
                await supabase
                  .from('book_request')
                  .update({ status: 'pending' })
                  .eq('id', clientId);
                Alert.alert('Error', 'Failed to update slot availability. Please try again.');
                return;
              }

              Alert.alert('Success', 'Session approved successfully and slot marked as booked');
              await loadClients();
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'An error occurred');
            }
          }
        }
      ]
    );
  };

  const handleReject = async (clientId: string) => {
    Alert.alert(
      'Reject Session',
      'Are you sure you want to reject this session request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get session details first
              const { data: sessionData, error: fetchError } = await supabase
                .from('book_request')
                .select('*')
                .eq('id', clientId)
                .maybeSingle();

              if (fetchError) {
                console.error('Error fetching session details:', fetchError);
              }

              // Update the request to rejected
              const { error } = await supabase
                .from('book_request')
                .update({ status: 'rejected' })
                .eq('id', clientId);

              if (error) {
                console.error('Error rejecting session:', error);
                Alert.alert('Error', 'Failed to reject session');
              } else {
                // If session was previously approved, free the slot
                if (sessionData && sessionData.status === 'approved') {
                  const sessionTimeFormatted = sessionData.session_time.includes(':') 
                    ? `${sessionData.session_time}:00` 
                    : sessionData.session_time;

                  await supabase
                    .from('student_schedule')
                    .update({ 
                      is_available: true,
                      booked_by: null
                    })
                    .eq('peer_registration_number', profile?.registration_number)
                    .eq('date', sessionData.session_date)
                    .eq('booked_by', sessionData.student_id);
                }

                Alert.alert('Success', 'Session rejected');
                await loadClients();
              }
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'An error occurred');
            }
          }
        }
      ]
    );
  };

  const handleComplete = async (clientId: string) => {
    Alert.alert(
      'Mark as Completed',
      'Mark this session as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              // Get session details first
              const { data: sessionData, error: fetchError } = await supabase
                .from('book_request')
                .select('*')
                .eq('id', clientId)
                .maybeSingle();

              if (fetchError) {
                console.error('Error fetching session details:', fetchError);
              }

              // Update the request to complete
              const { error } = await supabase
                .from('book_request')
                .update({ status: 'complete' })
                .eq('id', clientId);

              if (error) {
                console.error('Error completing session:', error);
                Alert.alert('Error', 'Failed to mark session as completed');
              } else {
                // Free the slot after session is complete
                if (sessionData) {
                  const sessionTimeFormatted = sessionData.session_time.includes(':') 
                    ? `${sessionData.session_time}:00` 
                    : sessionData.session_time;

                  await supabase
                    .from('student_schedule')
                    .update({ 
                      is_available: true,
                      booked_by: null
                    })
                    .eq('peer_registration_number', profile?.registration_number)
                    .eq('date', sessionData.session_date)
                    .eq('booked_by', sessionData.student_id);
                }

                Alert.alert('Success', 'Session marked as completed and slot freed');
                await loadClients();
              }
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'An error occurred');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      case 'complete': return '#2196F3';
      default: return Colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Clients</Text>
          {profile?.registration_number && (
            <Text style={styles.headerSubtitle}>
              Reg No: {profile.registration_number}
            </Text>
          )}
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or registration..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={Colors.textSecondary}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {(['all', 'pending', 'approved', 'rejected', 'complete'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterTab,
              selectedFilter === filter && styles.filterTabActive
            ]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text
              style={[
                styles.filterText,
                selectedFilter === filter && styles.filterTextActive
              ]}
            >
              {filter === 'complete' ? 'Completed' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading clients...</Text>
        </View>
      ) : filteredClients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={80} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>
            {searchQuery ? 'No matching clients found' : 'No client sessions yet'}
          </Text>
          <Text style={styles.emptySubText}>
            {searchQuery
              ? 'Try adjusting your search'
              : 'Client session requests will appear here'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredClients.map((client) => (
            <TouchableOpacity
              key={client.id}
              style={styles.clientCard}
              onPress={() => handleViewDetails(client)}
              activeOpacity={0.7}
            >
              {/* Client Header */}
              <View style={styles.clientHeader}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{client.studentName}</Text>
                  <Text style={styles.clientReg}>Reg: {client.studentReg}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(client.status) + '20' }
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(client.status) }
                    ]}
                  >
                    {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                  </Text>
                </View>
              </View>

              {/* Session Details */}
              <View style={styles.sessionDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar" size={16} color={Colors.primary} />
                  <Text style={styles.detailText}>{formatDate(client.session_date)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Ionicons name="time" size={16} color={Colors.primary} />
                  <Text style={styles.detailText}>{formatTime(client.session_time)}</Text>
                </View>
                {client.booking_mode && (
                  <View style={styles.detailRow}>
                    <Ionicons
                      name={client.booking_mode === 'online' ? 'videocam' : 'person'}
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.detailText}>
                      {client.booking_mode === 'online' ? 'Online Session' : 'In-Person Session'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Notes */}
              {client.notes && (
                <View style={styles.notesContainer}>
                  <Text style={styles.notesLabel}>Notes:</Text>
                  <Text style={styles.notesText}>{client.notes}</Text>
                </View>
              )}

              {/* Chat Button - Always visible */}
              <TouchableOpacity
                style={styles.chatButton}
                onPress={(e) => {
                  e.stopPropagation();
                  
                  console.log('Chat button pressed with client:', {
                    studentId: client.studentId,
                    studentName: client.studentName,
                    studentReg: client.studentReg,
                  });

                  if (!client.studentId) {
                    Alert.alert('Error', 'Cannot start chat. Student information is missing.');
                    return;
                  }

                  router.push({
                    pathname: '/student/chat',
                    params: {
                      participantId: client.studentId,
                      participantName: client.studentName,
                      participantType: 'STUDENT',
                    }
                  });
                }}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color={Colors.primary} />
                <Text style={styles.chatButtonText}>Chat with Client</Text>
              </TouchableOpacity>

              {/* Action Buttons */}
              {client.status === 'pending' && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => handleApprove(client.id)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="white" />
                    <Text style={styles.actionButtonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={() => handleReject(client.id)}
                  >
                    <Ionicons name="close-circle" size={20} color="white" />
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}

              {client.status === 'approved' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.completeButton]}
                  onPress={() => handleComplete(client.id)}
                >
                  <Ionicons name="checkmark-done" size={20} color="white" />
                  <Text style={styles.actionButtonText}>Mark as Completed</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Client Details Modal */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Client Details</Text>
              <TouchableOpacity
                onPress={() => setShowDetailsModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {selectedClient && (
              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                {/* Contact Actions */}
                <View style={styles.contactActionsContainer}>
                  <TouchableOpacity
                    style={styles.contactButton}
                    onPress={() => handleMessageClient(selectedClient)}
                  >
                    <Ionicons name="chatbubble" size={20} color="white" />
                    <Text style={styles.contactButtonText}>Message</Text>
                  </TouchableOpacity>
                  
                  {selectedClient.studentPhone && (
                    <TouchableOpacity
                      style={styles.contactButton}
                      onPress={() => handleCallClient(selectedClient.studentPhone!)}
                    >
                      <Ionicons name="call" size={20} color="white" />
                      <Text style={styles.contactButtonText}>Call</Text>
                    </TouchableOpacity>
                  )}
                  
                  {selectedClient.studentEmail && (
                    <TouchableOpacity
                      style={styles.contactButton}
                      onPress={() => handleEmailClient(selectedClient.studentEmail!)}
                    >
                      <Ionicons name="mail" size={20} color="white" />
                      <Text style={styles.contactButtonText}>Email</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Client Info Section */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Personal Information</Text>
                  
                  <View style={styles.modalDetailRow}>
                    <Ionicons name="person" size={20} color={Colors.primary} />
                    <View style={styles.modalDetailContent}>
                      <Text style={styles.modalDetailLabel}>Name</Text>
                      <Text style={styles.modalDetailValue}>{selectedClient.studentName}</Text>
                    </View>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Ionicons name="card" size={20} color={Colors.primary} />
                    <View style={styles.modalDetailContent}>
                      <Text style={styles.modalDetailLabel}>Registration Number</Text>
                      <Text style={styles.modalDetailValue}>{selectedClient.studentReg}</Text>
                    </View>
                  </View>

                  {selectedClient.studentEmail && (
                    <View style={styles.modalDetailRow}>
                      <Ionicons name="mail" size={20} color={Colors.primary} />
                      <View style={styles.modalDetailContent}>
                        <Text style={styles.modalDetailLabel}>Email</Text>
                        <Text style={styles.modalDetailValue}>{selectedClient.studentEmail}</Text>
                      </View>
                    </View>
                  )}

                  {selectedClient.studentPhone && (
                    <View style={styles.modalDetailRow}>
                      <Ionicons name="call" size={20} color={Colors.primary} />
                      <View style={styles.modalDetailContent}>
                        <Text style={styles.modalDetailLabel}>Phone</Text>
                        <Text style={styles.modalDetailValue}>{selectedClient.studentPhone}</Text>
                      </View>
                    </View>
                  )}

                  {selectedClient.studentType && (
                    <View style={styles.modalDetailRow}>
                      <Ionicons name="briefcase" size={20} color={Colors.primary} />
                      <View style={styles.modalDetailContent}>
                        <Text style={styles.modalDetailLabel}>User Type</Text>
                        <Text style={styles.modalDetailValue}>{selectedClient.studentType}</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Session Info Section */}
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Session Information</Text>
                  
                  <View style={styles.modalDetailRow}>
                    <Ionicons name="calendar" size={20} color={Colors.primary} />
                    <View style={styles.modalDetailContent}>
                      <Text style={styles.modalDetailLabel}>Date</Text>
                      <Text style={styles.modalDetailValue}>{formatDate(selectedClient.session_date)}</Text>
                    </View>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Ionicons name="time" size={20} color={Colors.primary} />
                    <View style={styles.modalDetailContent}>
                      <Text style={styles.modalDetailLabel}>Time</Text>
                      <Text style={styles.modalDetailValue}>{formatTime(selectedClient.session_time)}</Text>
                    </View>
                  </View>

                  {selectedClient.booking_mode && (
                    <View style={styles.modalDetailRow}>
                      <Ionicons
                        name={selectedClient.booking_mode === 'online' ? 'videocam' : 'person'}
                        size={20}
                        color={Colors.primary}
                      />
                      <View style={styles.modalDetailContent}>
                        <Text style={styles.modalDetailLabel}>Mode</Text>
                        <Text style={styles.modalDetailValue}>
                          {selectedClient.booking_mode === 'online' ? 'Online Session' : 'In-Person Session'}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.modalDetailRow}>
                    <Ionicons name="information-circle" size={20} color={Colors.primary} />
                    <View style={styles.modalDetailContent}>
                      <Text style={styles.modalDetailLabel}>Status</Text>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedClient.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(selectedClient.status) }]}>
                          {selectedClient.status.charAt(0).toUpperCase() + selectedClient.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <Ionicons name="time-outline" size={20} color={Colors.primary} />
                    <View style={styles.modalDetailContent}>
                      <Text style={styles.modalDetailLabel}>Requested On</Text>
                      <Text style={styles.modalDetailValue}>
                        {new Date(selectedClient.created_at).toLocaleString('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Notes Section */}
                {selectedClient.notes && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Notes</Text>
                    <View style={styles.modalNotesBox}>
                      <Text style={styles.modalNotesText}>{selectedClient.notes}</Text>
                    </View>
                  </View>
                )}

                {/* Action Buttons in Modal */}
                <View style={styles.modalActionsSection}>
                  {selectedClient.status === 'pending' && (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.approveButton]}
                        onPress={() => {
                          setShowDetailsModal(false);
                          handleApprove(selectedClient.id);
                        }}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="white" />
                        <Text style={styles.actionButtonText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => {
                          setShowDetailsModal(false);
                          handleReject(selectedClient.id);
                        }}
                      >
                        <Ionicons name="close-circle" size={20} color="white" />
                        <Text style={styles.actionButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {selectedClient.status === 'approved' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.completeButton]}
                      onPress={() => {
                        setShowDetailsModal(false);
                        handleComplete(selectedClient.id);
                      }}
                    >
                      <Ionicons name="checkmark-done" size={20} color="white" />
                      <Text style={styles.actionButtonText}>Mark as Completed</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: Colors.text,
  },
  filterContainer: {
    marginBottom: 15,
    maxHeight: 50,
  },
  filterContent: {
    paddingHorizontal: 20,
    paddingRight: 40,
  },
  filterTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 10,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  clientCard: {
    backgroundColor: Colors.white,
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  clientReg: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sessionDetails: {
    backgroundColor: Colors.backgroundLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    color: Colors.text,
    marginLeft: 8,
  },
  notesContainer: {
    backgroundColor: Colors.backgroundLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  chatButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  completeButton: {
    backgroundColor: '#2196F3',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScroll: {
    flex: 1,
  },
  modalSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingLeft: 5,
  },
  modalDetailContent: {
    flex: 1,
    marginLeft: 12,
  },
  modalDetailLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalDetailValue: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  modalNotesBox: {
    backgroundColor: Colors.backgroundLight,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  modalNotesText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  modalActionsSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  contactActionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 10,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
    minWidth: '30%',
  },
  contactButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});
