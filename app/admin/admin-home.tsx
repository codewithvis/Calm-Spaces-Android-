import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { pickMediaFromGallery } from '@/lib/utils';
import { useAdminUsers } from '@/hooks/admin/useAdminUsers';
import { useAdminCommunity } from '@/hooks/admin/useAdminCommunity';
import { AdminStatsRow } from '@/components/admin/AdminStatsRow';
import { AdminUserCard } from '@/components/admin/AdminUserCard';
import { CommunityPostCard } from '@/components/admin/CommunityPostCard';
import { UserTypeModal } from '@/components/admin/modals/UserTypeModal';
import { PostModal } from '@/components/admin/modals/PostModal';
import { CommentsModal } from '@/components/admin/modals/CommentsModal';
import { AdminUser } from '@/types/Admin';
import { CommunityPost } from '@/types/Community';

export default function AdminHome() {
  const router = useRouter();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'settings' | 'BuddyConnect'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<string | null>(null);

  // Hooks
  const { users, loadingUsers, stats, changingType, handleChangeUserType } = useAdminUsers(activeTab);
  const {
    posts, loadingPosts, isPosting, comments,
    fetchPosts, createPost, deletePost, updatePost, fetchComments, addComment, deleteComment
  } = useAdminCommunity();

  // Modal States
  const [userTypeModalVisible, setUserTypeModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

  // Form States
  const [postText, setPostText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    if (activeTab === 'settings') {
      router.push('./admin-setting');
    }
  }, [activeTab, router]);

  const handlePickMedia = async () => {
    const result = await pickMediaFromGallery();
    if (result) setSelectedMedia(result);
  };

  const handleCreatePost = async () => {
    if (!session?.user?.id) return;
    const success = await createPost(postText, selectedMedia, session.user.id);
    if (success) {
      setPostModalVisible(false);
      setPostText('');
      setSelectedMedia(null);
      Alert.alert('Success', 'Post created successfully!');
    }
  };

  const handleDeletePost = (post: CommunityPost) => {
    Alert.alert('Delete Post', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id) }
    ]);
  };

  const handleOpenComments = (post: CommunityPost) => {
    setSelectedPost(post);
    setCommentsModalVisible(true);
    fetchComments(post.id);
  };

  const filteredUsers = users
    .filter(u => !userTypeFilter || u.type === userTypeFilter)
    .filter(u => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.reg_no.toString().includes(q);
    });

  const renderHomeContent = () => (
    <ScrollView style={styles.scrollContent}>
      <Text style={styles.title}>Admin Home</Text>

      <View style={styles.searchContainer}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search users..."
          placeholderTextColor="#888"
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <AdminStatsRow
        stats={stats}
        userTypeFilter={userTypeFilter}
        onFilterPress={setUserTypeFilter}
      />

      {loadingUsers ? (
        <Text style={styles.infoText}>Loading users...</Text>
      ) : filteredUsers.length === 0 ? (
        <Text style={styles.infoText}>No users found</Text>
      ) : (
        filteredUsers.map(user => (
          <AdminUserCard
            key={user.id}
            user={user}
            onChangeTypePress={(u) => { setSelectedUser(u); setUserTypeModalVisible(true); }}
          />
        ))
      )}
    </ScrollView>
  );

  const renderCommunityContent = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.communityHeader}>
        <Text style={styles.communityTitle}>Community</Text>
        <TouchableOpacity onPress={() => setPostModalVisible(true)}>
          <Ionicons name="add" size={28} color="#FFB347" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <CommunityPostCard
            post={item}
            onCommentsPress={handleOpenComments}
            onDeletePress={handleDeletePost}
          />
        )}
        refreshing={loadingPosts}
        onRefresh={fetchPosts}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {activeTab === 'home' && renderHomeContent()}
        {activeTab === 'BuddyConnect' && renderCommunityContent()}
      </View>

      <View style={styles.tabBar}>
        <TabItem icon="🏠" label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
        <TabItem icon="⚙️" label="Settings" active={activeTab === 'settings'} onPress={() => setActiveTab('settings')} />
        <TabItem icon="👥" label="Community" active={activeTab === 'BuddyConnect'} onPress={() => setActiveTab('BuddyConnect')} />
      </View>

      <UserTypeModal
        visible={userTypeModalVisible}
        user={selectedUser}
        changingType={changingType}
        onClose={() => setUserTypeModalVisible(false)}
        onTypeSelect={(type) => handleChangeUserType(selectedUser!.id, selectedUser!.name, type).then(() => setUserTypeModalVisible(false))}
      />

      <PostModal
        visible={postModalVisible}
        postText={postText}
        selectedMedia={selectedMedia}
        isPosting={isPosting}
        onClose={() => setPostModalVisible(false)}
        onPostTextChange={setPostText}
        onPickMedia={handlePickMedia}
        onRemoveMedia={() => setSelectedMedia(null)}
        onSubmit={handleCreatePost}
      />

      <CommentsModal
        visible={commentsModalVisible}
        post={selectedPost}
        comments={comments}
        newComment={newComment}
        onClose={() => setCommentsModalVisible(false)}
        onNewCommentChange={setNewComment}
        onAddComment={() => {
          if (session?.user?.id) {
            addComment(selectedPost!.id, newComment, session.user.id).then(() => setNewComment(''));
          }
        }}
        onDeleteComment={(id) => deleteComment(id, selectedPost!.id)}
      />
    </SafeAreaView>
  );
}

interface TabItemProps {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({ icon, label, active, onPress }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Text style={[styles.tabIcon, active && styles.activeTabIcon]}>{icon}</Text>
    <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  content: { flex: 1 },
  scrollContent: { flex: 1, padding: 16 },
  title: { color: '#FFB347', fontSize: 28, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  searchContainer: { marginBottom: 16 },
  searchInput: { backgroundColor: '#222', color: 'white', padding: 14, borderRadius: 12, fontSize: 16, borderWidth: 2, borderColor: '#444' },
  clearBtn: { position: 'absolute', right: 12, top: 12, backgroundColor: '#e74c3c', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  clearBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  infoText: { color: '#888', textAlign: 'center', marginTop: 40 },
  communityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 15 },
  communityTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFB347' },
  tabBar: { flexDirection: 'row', backgroundColor: '#222', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 15, paddingBottom: 25 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 24, marginBottom: 4, color: 'white' },
  activeTabIcon: { color: '#FFB347' },
  tabLabel: { fontSize: 12, color: 'white', fontWeight: '500' },
  activeTabLabel: { color: '#FFB347', fontWeight: 'bold' },
});
