import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useProfile } from '@/api/Profile';
import { useAuth } from '@/providers/AuthProvider';
import PeerScreen from './peer-screen';
import { setupNotificationListeners, removeNotificationListeners } from '@/lib/notificationService';
import { usePermissions } from '@/lib/useAppPermissions';
import { PermissionRationaleModal } from '@/components/modals/PermissionRationaleModal';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { MoodCheckInModal } from '@/components/student/MoodCheckInModal';
import { MoodCalendar } from '@/components/student/MoodCalendar';
import { ToolkitModal } from '@/components/student/ToolkitModal';
import { useMoodTracking } from '@/hooks/useMoodTracking';
import { profilePics } from '@/constants/ProfilePhotos';

// Base tabs for all users
const BASE_TABS = [
  { key: 'home', icon: '🏠' },
  { key: 'mood', icon: '😊' },
  { key: 'sos', icon: '0️⃣' },
  { key: 'setting', icon: '⚙️' },
];

const PEER_TAB = { key: 'peer', icon: '👥' };

function getGreeting(userName?: string) {
  const now = new Date();
  let hour = now.getHours();
  let greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
  return userName ? `${greeting}, ${userName}!` : greeting;
}

export default function StudentHome() {
  const params = useLocalSearchParams<{ registration: string }>();
  const [activeTab, setActiveTab] = useState('home');
  const [moodModalVisible, setMoodModalVisible] = useState(false);
  const [selectedProfilePic, setSelectedProfilePic] = useState(0);
  const [showToolkitPage, setShowToolkitPage] = useState(false);

  const { session } = useAuth();
  const { data: profile } = useProfile(session?.user.id);
  const {
    moodHistory, dailyMoodEntries, todayMoodProgress, currentPromptInfo,
    missedPromptsQueue, checkForMoodPrompt, saveMood
  } = useMoodTracking(session?.user.id, profile?.type);

  const router = useRouter();

  const TABS = React.useMemo(() => {
    const tabs = [...BASE_TABS];
    if (profile?.type === "PEER") tabs.splice(2, 0, PEER_TAB);
    return tabs;
  }, [profile]);

  const { 
    isRationaleVisible, setIsRationaleVisible, requestPermission, checkPermissionStatus
  } = usePermissions();

  useEffect(() => {
    const init = async () => {
      const { status } = await checkPermissionStatus('notifications');
      if (status !== 'granted') console.log('ℹ️ Notification permission not granted');

      const shouldShow = await checkForMoodPrompt();
      if (shouldShow) setMoodModalVisible(true);
    };
    init();

    const listeners = setupNotificationListeners(
      () => {},
      async (response) => {
        if (response.notification.request.content.data?.type === 'mood_reminder') {
          // Refresh prompt info before showing modal
          await checkForMoodPrompt();
          setMoodModalVisible(true);
        }
      }
    );
    return () => removeNotificationListeners(listeners);
  }, [checkForMoodPrompt, checkPermissionStatus]);

  useFocusEffect(
    useCallback(() => {
      if (profile?.profile_picture_index !== undefined) {
        setSelectedProfilePic(profile.profile_picture_index);
      }
    }, [profile])
  );

  const handleSelectMood = async (mood: string) => {
    const success = await saveMood(mood);
    if (success) setMoodModalVisible(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {activeTab === 'home' && <AnimatedBackground />}

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 }}>
        {activeTab === 'home' && (
          <>
            <View style={{ position: 'absolute', top: 40, left: 16, zIndex: 10, backgroundColor: Colors.backgroundLight, borderRadius: 20, padding: 6, borderWidth: 2, borderColor: Colors.primary }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Image source={profilePics[selectedProfilePic]} style={{ width: 32, height: 32, borderRadius: 16 }} />
                <Text style={{ color: Colors.text, fontSize: 13, marginLeft: 10, fontWeight: 'bold' }}>{getGreeting(profile?.name)}</Text>
              </View>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 120 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                <HomeButton icon={require('@/assets/images/self help tool kit.png')} label="Toolkit" onPress={() => setShowToolkitPage(true)} />
                <HomeButton icon={require('@/assets/images/calmcampanion.png')} label="Calm Space" onPress={() => router.push('./student-calm')} />
                <HomeButton icon={require('@/assets/images/community.png')} label="Community" onPress={() => router.push('./buddy-connect')} />
                <HomeButton icon={require('@/assets/images/journal.png')} label="Journal" onPress={() => router.push('./journal')} />
                <HomeButton icon={require('@/assets/images/supportself.png')} label="Support" onPress={() => router.push('./support')} />
                <HomeButton icon={require('@/assets/images/message.png')} label="Messages" onPress={() => router.push(`./message?registration=${params.registration}`)} />
              </View>
            </View>
          </>
        )}

        {activeTab === 'mood' && (
          <ScrollView style={{ flex: 1, width: '100%' }}>
            <MoodCalendar moodHistory={moodHistory} dailyMoodEntries={dailyMoodEntries} todayMoodProgress={todayMoodProgress} />
          </ScrollView>
        )}
        {activeTab === 'peer' && profile?.type === "PEER" && <PeerScreen />}
      </View>

      <TabBar tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} registration={params.registration} />

      <MoodCheckInModal
        visible={moodModalVisible}
        onClose={() => setMoodModalVisible(false)}
        onSelectMood={handleSelectMood}
        studentName={profile?.name || 'Student'}
        currentPromptInfo={currentPromptInfo}
        todayMoodProgress={todayMoodProgress}
        missedPromptsQueue={missedPromptsQueue}
      />

      <ToolkitModal
        visible={showToolkitPage}
        onClose={() => setShowToolkitPage(false)}
        registration={params.registration}
      />

      <PermissionRationaleModal
        isVisible={isRationaleVisible}
        onConfirm={async () => { setIsRationaleVisible(false); await requestPermission('notifications'); }}
        onCancel={() => setIsRationaleVisible(false)}
        title="Notifications"
        description="We use notifications for mood reminders and updates."
        iconName="notifications"
        buttonText="Enable"
      />
    </View>
  );
}

interface HomeButtonProps {
  icon: any;
  label: string;
  onPress: () => void;
}

const HomeButton: React.FC<HomeButtonProps> = ({ icon, label, onPress }) => (
  <TouchableOpacity
    style={{ width: 140, height: 120, borderRadius: 25, justifyContent: 'center', alignItems: 'center', margin: 10, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.primary, elevation: 4 }}
    onPress={onPress}
  >
    <Image source={icon} style={{ width: 60, height: 60, marginBottom: 8 }} />
    <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: 'bold' }}>{label}</Text>
  </TouchableOpacity>
);

interface TabBarProps {
  tabs: Array<{ key: string; icon: string }>;
  activeTab: string;
  setActiveTab: (key: string) => void;
  registration?: string;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, setActiveTab, registration }) => {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: Colors.white, paddingVertical: 20, borderTopLeftRadius: 25, borderTopRightRadius: 25, elevation: 6, borderTopWidth: 3, borderTopColor: Colors.primary }}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={{ flex: 1, alignItems: 'center' }}
          onPress={() => {
            if (tab.key === 'setting') router.push(`./student-setting?registration=${registration}`);
            else if (tab.key === 'sos') router.push('./emergency');
            else setActiveTab(tab.key);
          }}
        >
          <Text style={{ fontSize: 24, color: activeTab === tab.key ? Colors.primary : '#666' }}>{tab.icon}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
