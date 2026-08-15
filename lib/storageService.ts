import { supabase } from './supabase';
import { logger } from './logger';

/**
 * Service to handle Supabase Storage operations
 */
export const storageService = {
  /**
   * Deletes user-owned files from storage
   * @param urls Array of public URLs to delete
   * @param bucket Bucket name
   */
  async deleteFilesByUrls(urls: (string | null)[], bucket: string = 'media') {
    const validUrls = urls.filter((url): url is string => !!url && url.includes(bucket));
    if (validUrls.length === 0) return;

    logger.info(`Attempting to clean up ${validUrls.length} files from storage bucket: ${bucket}`);

    for (const url of validUrls) {
      try {
        // Extract path from public URL
        // Example URL: https://.../storage/v1/object/public/media/community/filename.jpg
        // Path needed: community/filename.jpg
        const pathMatch = url.match(new RegExp(`${bucket}/(.+)`));
        if (pathMatch && pathMatch[1]) {
          const path = pathMatch[1];
          const { error } = await supabase.storage.from(bucket).remove([path]);
          if (error) {
            logger.warn(`Failed to delete storage file: ${path}`, error);
          } else {
            logger.debug(`Deleted storage file: ${path}`);
          }
        }
      } catch (err) {
        logger.error('Error extracting path from storage URL', err);
      }
    }
  },

  /**
   * Comprehensive cleanup for a user before account deletion
   */
  async cleanupUserStorage(userId: string) {
    try {
      logger.info(`Searching for storage files to clean up for user: ${userId}`);

      // 1. Find community post media (Using profile_id/UUID)
      const { data: posts, error: postsError } = await supabase
        .from('community_post')
        .select('media_url')
        .eq('profile_id', userId);

      if (postsError) {
        logger.error('Error fetching posts for cleanup', postsError);
      } else if (posts && posts.length > 0) {
        const urls = posts.map(p => p.media_url);
        await this.deleteFilesByUrls(urls, 'media');
      }

      // 2. Fallback for legacy data (registration number)
      // This can be removed after data migration is fully confirmed
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('registration_number')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
          logger.error('Error fetching profile for legacy cleanup', profileError);
      } else if (profile?.registration_number) {
        const { data: legacyPosts, error: legacyPostsError } = await supabase
          .from('community_post')
          .select('media_url')
          .eq('user_id', profile.registration_number.toString());

        if (legacyPostsError) {
            logger.error('Error fetching legacy posts for cleanup', legacyPostsError);
        } else if (legacyPosts && legacyPosts.length > 0) {
          const urls = legacyPosts.map(p => p.media_url);
          await this.deleteFilesByUrls(urls, 'media');
        }
      }

    } catch (error) {
      logger.error('Storage cleanup failed', error);
    }
  }
};
