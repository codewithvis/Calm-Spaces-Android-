import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const useCommunity = (userRegNo: string | undefined) => {
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ['community_posts'],
    queryFn: async () => {
      // Use the SECURE VIEW to avoid PII leakage
      const { data, error } = await supabase
        .from('community_feed')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback for legacy support or if migration isn't applied yet
        const { data: postsData, error: postsError } = await supabase
          .from('community_post')
          .select('*, profiles(name, username, profile_picture_index, type)')
          .order('created_at', { ascending: false });

        if (postsError) throw postsError;

        return (postsData || []).map(post => ({
          ...post,
          author_name: post.profiles?.name || post.profiles?.username || 'User',
          author_profile_pic: post.profiles?.profile_picture_index || 0,
          author_type: post.profiles?.type || 'STUDENT',
          author_id: post.profile_id || post.user_id
        }));
      }

      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const deletePost = async (postId: string) => {
    try {
      const { error } = await supabase.from('community_post').delete().eq('id', postId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['community_posts'] });
      return true;
    } catch (err) {
      console.error('Error deleting post:', err);
      Alert.alert('Error', 'Failed to delete post');
      return false;
    }
  };

  return {
    posts,
    loadingPosts,
    deletePost
  };
};
