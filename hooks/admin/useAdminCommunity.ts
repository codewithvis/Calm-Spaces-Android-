import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { CommunityPost, PostComment } from '@/types/Community';
import { uploadMediaToSupabase } from '@/lib/utils';
import { profilePics } from '@/constants/ProfilePhotos';
import { Alert } from 'react-native';

export const useAdminCommunity = () => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      // Use secure view
      const { data, error } = await supabase
        .from('community_feed')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback for legacy support
        const { data: postsData, error: postsError } = await supabase
          .from('community_post')
          .select('*, profiles(name, username, profile_picture_index, type)')
          .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        setPosts((postsData || []).map(post => ({
          ...post,
          author_name: post.profiles?.name || post.profiles?.username || 'User',
          author_profile_pic: post.profiles?.profile_picture_index || 0,
          author_type: post.profiles?.type || 'STUDENT',
          author_id: post.profile_id || post.user_id
        })));
        return;
      }

      setPosts(data || []);
    } catch (error) {
      logger.error('Error fetching posts', error);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  const createPost = async (text: string, media: { uri: string; type: 'image' | 'video' } | null, adminId: string) => {
    if (!text.trim() && !media) return false;

    setIsPosting(true);
    try {
      let mediaUrl = null;
      if (media) {
        mediaUrl = await uploadMediaToSupabase(media.uri, media.type);
      }

      const { error } = await supabase
        .from('community_post')
        .insert([{
          profile_id: adminId,
          content: text.trim(),
          media_url: mediaUrl,
          media_type: media?.type || null,
          created_at: new Date().toISOString(),
        }]);

      if (error) throw error;
      await fetchPosts();
      return true;
    } catch (error) {
      logger.error('Error creating post', error);
      return false;
    } finally {
      setIsPosting(false);
    }
  };

  const deletePost = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('community_post')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      setPosts(prev => prev.filter(p => p.id !== postId));
      return true;
    } catch (error) {
      logger.error('Error deleting post', error);
      return false;
    }
  };

  const updatePost = async (postId: string, text: string, media: { uri: string; type: 'image' | 'video' } | null, existingMediaUrl: string | null) => {
    setIsPosting(true);
    try {
      let mediaUrl = existingMediaUrl;
      let mediaType = media?.type || null;

      if (media && media.uri !== existingMediaUrl) {
        mediaUrl = await uploadMediaToSupabase(media.uri, media.type);
      } else if (!media) {
        mediaUrl = null;
        mediaType = null;
      }

      const { error } = await supabase
        .from('community_post')
        .update({
          content: text.trim(),
          media_url: mediaUrl,
          media_type: mediaType,
        })
        .eq('id', postId);

      if (error) throw error;
      await fetchPosts();
      return true;
    } catch (error) {
      logger.error('Error updating post', error);
      return false;
    } finally {
      setIsPosting(false);
    }
  };

  const fetchComments = async (postId: string) => {
    setLoadingComments(true);
    try {
      // Use secure view
      const { data, error } = await supabase
        .from('community_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) {
        // Fallback
        const { data: fbData, error: fbError } = await supabase
          .from('post_comment')
          .select('*, profiles(name, username, profile_picture_index, type)')
          .eq('post_id', postId)
          .order('created_at', { ascending: true });

        if (fbError) throw fbError;

        setComments((fbData || []).map(c => ({
          ...c,
          author_name: c.profiles?.name || c.profiles?.username || 'User',
          author_profile_pic: c.profiles?.profile_picture_index || 0,
          author_type: c.profiles?.type || 'STUDENT',
          isExpert: c.profiles?.type === 'EXPERT',
          author_id: c.profile_id || c.user_id
        })));
        return;
      }

      setComments((data || []).map(c => ({
        ...c,
        isExpert: c.author_type === 'EXPERT'
      })));
    } catch (error) {
      logger.error('Error fetching comments', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const addComment = async (postId: string, text: string, adminId: string) => {
    try {
      const { error } = await supabase
        .from('post_comment')
        .insert([{
          post_id: postId,
          profile_id: adminId,
          content: text.trim(),
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;
      await fetchComments(postId);
      return true;
    } catch (error) {
      logger.error('Error adding comment', error);
      return false;
    }
  };

  const deleteComment = async (commentId: string, postId: string) => {
    try {
      const { error } = await supabase
        .from('post_comment')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      await fetchComments(postId);
      return true;
    } catch (error) {
      logger.error('Error deleting comment', error);
      return false;
    }
  };

  return {
    posts,
    loadingPosts,
    isPosting,
    comments,
    loadingComments,
    fetchPosts,
    createPost,
    deletePost,
    updatePost,
    fetchComments,
    addComment,
    deleteComment
  };
};
