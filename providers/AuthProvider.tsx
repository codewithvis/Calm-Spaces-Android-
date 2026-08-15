import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { registerForPushNotificationsAsync } from "@/lib/notificationService";

type AuthData = {
    session: Session | null;
    loading: boolean;
};
const AuthContext = createContext<AuthData>({
    session: null,
    loading: true,
});

export default function AuthProvider({children}: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSession = async() => {
            try {
                const {data, error} = await supabase.auth.getSession();
                if (error) {
                    console.error('Auth getSession error:', error.message);
                }
                setSession(data.session);
                setLoading(false);
            } catch (err) {
                console.error('Exception fetching session:', err);
                setLoading(false);
            }
        };
        fetchSession();
        
        const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            console.log('Auth state changed:', _event);
            setSession(session);
            if (_event === 'INITIAL_SESSION' || _event === 'SIGNED_IN') {
                setLoading(false);
                if (session?.user?.id) {
                    // Automatically register for push notifications on login
                    registerForPushNotificationsAsync(session.user.id);
                }
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };

    }, []);

    return <AuthContext.Provider value={{session, loading}}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);