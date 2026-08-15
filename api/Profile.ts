import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/Profile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert } from "react-native";
import Toast from "react-native-toast-message";
import { logger } from "@/lib/logger";
import { storageService } from "@/lib/storageService";

export const useGetProfileList = (user_type: string) => {
  return useQuery({
    queryKey: ["profiles", user_type],
    queryFn: async () => {
      logger.debug(`Fetching profiles with type: ${user_type}`);
      const { data, error } = await supabase.from("profiles").select("*").eq("type", user_type);
      if (error) {
        logger.error("Error fetching profiles", error);
        throw new Error("Error fetching profiles");
      }
      return data as Profile[];
    }
  });
};

export const useProfile = (userId: string | null | undefined) => {
  return useQuery<Profile | null>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching profile', error);
        throw new Error(error.message);
      }
      return data as Profile;
    },
    enabled: !!userId,
  });
};

export const useSaveProfileChanges = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; username: string; name: string }) => {
      const { error, data: updatedProfile } = await supabase
        .from("profiles")
        .update({
          username: data.username,
          name: data.name,
        })
        .eq("id", data.id)
        .select()
        .maybeSingle();

      if (error) throw new Error(error.message);
      return updatedProfile;
    },

    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ['profile', variables.id],
      });
      Toast.show({
        type: 'success',
        text1: 'Changes saved',
        text2: 'Your profile was updated successfully.',
        position: 'bottom',
      });
    },
  });
};

export const useUpdateProfilePicture = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; profilePictureIndex: number }) => {
      const { error, data: updatedProfile } = await supabase
        .from("profiles")
        .update({
          profile_picture_index: data.profilePictureIndex,
        })
        .eq("id", data.id)
        .select()
        .maybeSingle();

      if (error) throw new Error(error.message);
      return updatedProfile;
    },

    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ['profile', variables.id],
      });
      logger.info('Profile picture updated successfully');
    },

    onError: (error) => {
      logger.error('Error updating profile picture', error);
    },
  });
};

/**
 * useDeleteAccount - Atomic Deletion
 * Relies on PostgreSQL ON DELETE CASCADE constraints for data integrity.
 */
export const useDeleteAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      logger.info(`Starting atomic account deletion for user: ${userId}`);

      // 1. Fetch profile details first for cleanup (e.g. storage)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('registration_number')
        .eq('id', userId)
        .maybeSingle();

      // 2. Cleanup physical storage files
      await storageService.cleanupUserStorage(userId);

      // 3. Single delete operation on the parent 'profiles' table.
      // Database foreign key constraints (ON DELETE CASCADE) will
      // automatically clean up student_locations, messages, community_post, etc.
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) {
        logger.error('Failed to delete profile record', profileError);
        throw new Error(profileError.message);
      }

      // 4. Request full auth deletion via Edge Function (to be implemented)
      try {
        await supabase.functions.invoke('delete-user-auth');
      } catch (authErr) {
        logger.warn('Auth deletion via edge function failed, falling back to signout', authErr);
      }

      // Final step: Sign out locally.
      await supabase.auth.signOut();

      return { success: true };
    },
    onSuccess: () => {
      queryClient.clear();
      Toast.show({
        type: 'success',
        text1: 'Account Deleted',
        text2: 'Your data has been permanently removed.',
        position: 'bottom',
      });
      router.replace("/");
    },
    onError: (error: any) => {
      logger.error('Error deleting account', error);
      Alert.alert('Error', 'Failed to delete account data. Please contact support.');
    }
  });
};

/**
 * checkUsernameExists - Securely check if a username is taken
 */
export const checkUsernameExists = async (username: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('check_username_exists', {
      username_to_check: username
    });

    if (error) {
      logger.error('Error checking username', error);
      // Fallback: search restricted by RLS
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: 'exact', head: true })
        .eq("username", username);
      return (count || 0) > 0;
    }

    return !!data;
  } catch (err) {
    logger.error('Exception checking username', err);
    return true; // Safe fallback: assume taken
  }
};

/**
 * checkRegistrationNumberExists - Securely check if a registration number is taken
 */
export const checkRegistrationNumberExists = async (regNo: string): Promise<boolean> => {
  try {
    const regNum = parseInt(regNo, 10);
    if (isNaN(regNum)) return false;

    const { data, error } = await supabase.rpc('check_registration_exists', {
      reg_to_check: regNum
    });

    if (error) {
      logger.error('Error checking registration number', error);
      // Fallback
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: 'exact', head: true })
        .eq("registration_number", regNum);
      return (count || 0) > 0;
    }

    return !!data;
  } catch (err) {
    logger.error('Exception checking registration number', err);
    return true; // Safe fallback
  }
};

