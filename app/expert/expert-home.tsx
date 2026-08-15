import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, Image } from 'react-native';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/api/Profile';
import Toast from 'react-native-toast-message';
import { useInsertNotification } from '@/api/Notifications';
import { profilePics } from '@/constants/ProfilePhotos';
import { setupNotificationListeners, removeNotificationListeners } from '@/lib/notificationService';
import { usePermissions } from '@/lib/useAppPermissions';
import { PermissionRationaleModal } from '@/components/modals/PermissionRationaleModal';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { MoodCheckInModal } from '@/components/student/MoodCheckInModal';
import { useMoodTracking } from '@/hooks/useMoodTracking';
import { useCommunity } from '@/hooks/useCommunity';
import { ExpertMoodTab } from '@/components/expert/ExpertMoodTab';
import { ExpertCommunityTab } from '@/components/expert/ExpertCommunityTab';
import { NotificationSender } from '@/components/expert/NotificationSender';

export default function ExpertHome() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'home' | 'mood' | 'community'>('home');
  const [moodModalVisible, setMoodModalVisible] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);

  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const { mutateAsync: insertNotification } = useInsertNotification();

  const { 
    moodHistory, dailyMoodEntries, todayMoodProgress, currentPromptInfo,
    missedPromptsQueue, checkForMoodPrompt, saveMood
  } = useMoodTracking(session?.user.id, 'EXPERT');

  const { posts, loadingPosts, deletePost } = useCommunity(profile?.registration_number?.toString());

  const { isRationaleVisible, setIsRationaleVisible, requestPermission, checkPermissionStatus } = usePermissions();

  useEffect(() => {
    const init = async () => {
      await checkPermissionStatus('notifications');
      if (await checkForMoodPrompt()) setMoodModalVisible(true);
    };
    init();

    const listeners = setupNotificationListeners(
      () => {},
      async (response) => {
        if (response.notification.request.content.data?.type === 'mood_reminder') {
          await checkForMoodPrompt();
          setMoodModalVisible(true);
        }
      }
    );
    return () => removeNotificationListeners(listeners);
  }, [checkForMoodPrompt, checkPermissionStatus]);

  const handleSendNotification = async (formData: any) => {
    setSendingNotification(true);
    try {
      await insertNotification({
        sender_id: session?.user.id ?? '',
        sender_name: profile?.name ?? 'Expert',
        sender_type: 'EXPERT',
        receiver_type: formData.receiver_type,
        title: formData.title,
        message: formData.message,
        priority: formData.priority,
        is_read: false,
        created_at: new Date().toISOString(),
      });
      Toast.show({ type: 'success', text1: 'Notification sent successfully' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Failed to send notification' });
    } finally {
      setSendingNotification(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {activeTab === 'home' && <AnimatedBackground />}

      <View style={{ flex: 1 }}>
        {activeTab === 'home' && (
          <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 60 }}>
            <View style={{ alignItems: 'center', marginBottom: 30 }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: Colors.primary }}>Expert Dashboard</Text>
              <Text style={{ fontSize: 16, color: Colors.textSecondary }}>Welcome, {profile?.name}</Text>
            </View>

            <NotificationSender onSend={handleSendNotification} isSending={sendingNotification} />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
              <ActionButton icon="👥" label="My Clients" onPress={() => router.push('./expert-client')} />
              <ActionButton icon="💬" label="Consultations" onPress={() => router.push(`./consultation`)} />
              <ActionButton icon="📅" label="Schedule" onPress={() => router.push("/expert/schedule")} />
              <ActionButton icon="📚" label="Support" onPress={() => router.push(`/expert/support`)} />
            </View>
          </ScrollView>
        )}

        {activeTab === 'mood' && (
          <ExpertMoodTab moodHistory={moodHistory} dailyMoodEntries={dailyMoodEntries} todayMoodProgress={todayMoodProgress} />
        )}

        {activeTab === 'community' && (
          <ExpertCommunityTab
            posts={posts}
            loadingPosts={loadingPosts}
            onAddPost={() => {}}
            onDeletePost={(p) => deletePost(p.id)}
            onOpenComments={() => {}}
          />
        )}
      </View>

      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <MoodCheckInModal
        visible={moodModalVisible}
        onClose={() => setMoodModalVisible(false)}
        onSelectMood={(m) => saveMood(m).then(() => setMoodModalVisible(false))}
        studentName={profile?.name || 'Expert'}
        currentPromptInfo={currentPromptInfo}
        todayMoodProgress={todayMoodProgress}
        missedPromptsQueue={missedPromptsQueue}
      />

      <PermissionRationaleModal
        isVisible={isRationaleVisible}
        onConfirm={async () => { setIsRationaleVisible(false); await requestPermission('notifications'); }}
        onCancel={() => setIsRationaleVisible(false)}
        title="Notifications"
        description="Enable notifications to stay updated."
        iconName="notifications"
        buttonText="Enable"
      />
    </View>
  );
}

const ActionButton = ({ icon, label, onPress }: any) => (
  <TouchableOpacity
    style={{ width: '45%', height: 120, backgroundColor: Colors.white, borderRadius: 25, justifyContent: 'center', alignItems: 'center', margin: '2.5%', borderWidth: 2, borderColor: Colors.primary, elevation: 4 }}
    onPress={onPress}
  >
    <Text style={{ fontSize: 32, marginBottom: 8 }}>{icon}</Text>
    <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: 'bold' }}>{label}</Text>
  </TouchableOpacity>
);

const TabBar = ({ activeTab, setActiveTab }: any) => {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: Colors.white, paddingVertical: 15, borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 6, borderTopWidth: 3, borderTopColor: Colors.primary }}>
      <TabItem icon="home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
      <TabItem icon="calendar" active={activeTab === 'mood'} onPress={() => setActiveTab('mood')} />
      <TabItem icon="people" active={activeTab === 'community'} onPress={() => setActiveTab('community')} />
      <TabItem icon="settings" active={false} onPress={() => router.push('./expert-setting')} />
    </View>
  );
};

const TabItem = ({ icon, active, onPress }: any) => (
  <TouchableOpacity onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
    <Ionicons name={icon as any} size={28} color={active ? Colors.primary : '#666'} />
  </TouchableOpacity>
);
