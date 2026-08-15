import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { FACULTY } from '@/constants/courses';
import { checkUsernameExists, checkRegistrationNumberExists } from "@/api/Profile";
import Toast from 'react-native-toast-message';
import { Picker } from '@react-native-picker/picker';
import { logger } from '@/lib/logger';

export default function StudentRegister() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [course, setCourse] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastAttemptTime, setLastAttemptTime] = useState<number>(0);

  const isCaptchaAuthError = (message?: string) => {
    const text = (message || '').toLowerCase();
    return (
      text.includes('captcha') ||
      text.includes('bot protection') ||
      text.includes('verification required')
    );
  };

  const getAuthErrorDetails = (message?: string, fallback = 'Registration failed') => {
    if (isCaptchaAuthError(message)) {
      return {
        title: 'Captcha protection enabled',
        message:
          'Supabase Auth is requiring a captcha token for registration. Disable captcha protection in Supabase Auth settings or add a captcha flow to the app before trying again.',
      };
    }

    return {
      title: fallback,
      message: message || fallback,
    };
  };

  // for date of birth selection
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  // Helper function to capitalize first letter of each word
  const capitalizeWords = (text: string) => {
    return text.replace(/\b\w/g, (char) => char.toUpperCase());
  };


  // Handler for name input - capitalize first letter of each word
  const handleNameChange = (text: string) => {
    const capitalized = capitalizeWords(text);
    setName(capitalized);
  };

  // Handler for email input - enforce lowercase and validate format
  const handleEmailChange = (text: string) => {
    setEmail(text.toLowerCase().trim());
  };

  // Handler for phone input - only allow 10 digits
  const handlePhoneChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length <= 10) {
      setPhone(numbers);
    }
  };

  // Handler for username - lowercase without spaces
  const handleUsernameChange = (text: string) => {
    const formatted = text.toLowerCase().replace(/\s/g, '');
    setUsername(formatted);
  };

  // Handler for registration number - only numbers
  const handleRegistrationChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    setRegistrationNumber(numbers);
  };

  const validateStudentData = async ({
    name,
    username,
    registrationNumber,
    course,
    phone,
    dob,
    email,
    password
  }: {
    name: string;
    username: string;
    registrationNumber: string;
    course: string;
    phone: string;
    dob: string;
    email: string;
    password: string;
  }) => {
    const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]{8,}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !username || !registrationNumber || !course || !phone || !dob || !email || !password) {
      Alert.alert("Missing Fields", "All fields are required.");
      return false;
    }

    // Validate phone number - must be exactly 10 digits
    if (phone.length !== 10) {
      Alert.alert("Invalid Phone Number", "Phone number must be exactly 10 digits.");
      return false;
    }

    // Validate email format and domain
    if (!emailRegex.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address (e.g., name@example.com).");
      return false;
    }

    // Validate username - no spaces, lowercase
    if (username.includes(' ')) {
      Alert.alert("Invalid Username", "Username cannot contain spaces.");
      return false;
    }

    // Validate registration number - numbers only
    if (!/^\d+$/.test(registrationNumber)) {
      Alert.alert("Invalid Registration Number", "Registration number must contain only numbers.");
      return false;
    }

    if (password.length < 8) {
      Alert.alert("Password too short", "Password must be at least 8 characters.");
      return false;
    }

    if (!passwordRegex.test(password)) {
      Alert.alert("Invalid Password", "Password must include letters, numbers, and special characters.");
      return false;
    }

    if (await checkUsernameExists(username)) {
      Alert.alert("Username taken", "Username is already taken. Try another one.");
      return false;
    }

    if (await checkRegistrationNumberExists(registrationNumber)) {
      Alert.alert("Registration Number taken", "Registration number is already taken.");
      return false;
    }

    // ——— ADD THIS DOB VALIDATION BLOCK ———
    if (dob) {
      const parts = dob.split('/');
      if (parts.length !== 3) {
        Alert.alert("Invalid Date", "Please enter a valid date of birth.");
        return false;
      }

      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      // Basic range checks
      if (
        isNaN(day) || isNaN(month) || isNaN(year) ||
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        year < 1900
      ) {
        Alert.alert("Invalid Date", "Please enter a valid date (DD/MM/YYYY).");
        return false;
      }

      // Year cannot be in the future or current year if birthday hasn't passed yet
      const today = new Date();
      const currentYear = today.getFullYear();
      if (year > currentYear) {
        Alert.alert("Invalid Date", "Year cannot be in the future.");
        return false;
      }

      // Special case: if year == current year, month/day must not be in future
      if (year === currentYear) {
        const currentMonth = today.getMonth() + 1; // getMonth() is 0-indexed
        const currentDay = today.getDate();

        if (month > currentMonth || (month === currentMonth && day > currentDay)) {
          Alert.alert("Invalid Date", "Date of birth cannot be in the future.");
          return false;
        }
      }

      // Validate days in month (including leap year for February)
      const daysInMonth = new Date(year, month, 0).getDate(); // magic: day 0 = last day of previous month

      if (day > daysInMonth) {
        const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
        Alert.alert(
          "Invalid Date",
          `${monthName} ${year} has only ${daysInMonth} days.`
        );
        return false;
      }
    }
    // ——— END OF DOB VALIDATION ———

    return true;
  };

  async function signUpWithEmail() {
    // Check if enough time has passed since last attempt (60 seconds cooldown)
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptTime;
    const cooldownPeriod = 60000; // 60 seconds

    if (timeSinceLastAttempt < cooldownPeriod && lastAttemptTime > 0) {
      const remainingSeconds = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / 1000);
      Alert.alert(
        "Please wait",
        `Please wait ${remainingSeconds} seconds before trying again to avoid rate limits.`
      );
      return;
    }

    const isValidated = await validateStudentData({
      name,
      username,
      registrationNumber,
      course,
      phone,
      dob,
      email,
      password
    });

    if (!isValidated) return;

    setLoading(true);
    setLastAttemptTime(now);

    try {
      logger.info('Attempting registration for email:', { email });

      // Step 1: Sign up the user with all profile data in metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            name: name,
            registration_number: registrationNumber,
            phone_number: phone,
            course: 'FACULTY_OF_' + course.replace(/\s+/g, '_').toUpperCase(),
            date_of_birth: dob,
            type: "STUDENT",
          },
        }
      });

      if (authError) {
        logger.error('Registration auth failure', authError);

        if (isCaptchaAuthError(authError.message)) {
          const authErrorDetails = getAuthErrorDetails(authError.message);
          Alert.alert(authErrorDetails.title, authErrorDetails.message);
          setLoading(false);
          return;
        }

        // Handle specific Supabase errors
        const msg = authError.message.toLowerCase();
        if (msg.includes('rate limit') || authError.status === 429) {
          Alert.alert("⏱️ Rate Limit", "Too many attempts. Please wait a few minutes.");
        } else if (msg.includes('already registered') || msg.includes('exists')) {
          Alert.alert("Account exists", "This email is already registered. Please login instead.", [
            { text: "Go to Login", onPress: () => router.replace('/') }
          ]);
        } else {
          Alert.alert("Registration Failed", authError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData?.user) {
        Alert.alert("Error", "Account creation returned no data. Please try again.");
        setLoading(false);
        return;
      }

      logger.info('Auth account created successfully', { userId: authData.user.id });

      // If email confirmation is required, the session might be null
      if (!authData.session) {
        Alert.alert(
          "Verify your email",
          "Account created! Please check your inbox and verify your email address before logging in.",
          [{ text: "OK", onPress: () => router.replace('/') }]
        );
        setLoading(false);
        return;
      }

      // If we reach here, we have a session. Wait for trigger to complete just in case.
      await new Promise(resolve => setTimeout(resolve, 500));

      Toast.show({
        type: 'success',
        text1: 'Registration successful!',
        text2: 'Welcome to CALM Space',
        position: 'top',
        visibilityTime: 2000,
      });

      // Navigate to home - AuthProvider will also handle this via session change
      router.replace('/student/student-home');

    } catch (err: any) {
      logger.error('Registration logic exception', err);
      Alert.alert("Error", "An unexpected error occurred. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedMonth && selectedDay && selectedYear) {
      const day = selectedDay.padStart(2, '0');
      const month = selectedMonth.toString().padStart(2, '0');
      const formatted = `${day}/${month}/${selectedYear}`;
      setDob(formatted);
    } else {
      setDob(''); // clear if incomplete
    }
  }, [selectedMonth, selectedDay, selectedYear]);


  return (
    <View style={styles.container}>
      <Svg height="100%" width="100%" style={styles.svg} viewBox="0 0 100 100">
        <Path d="M0,20 C30,40 70,0 100,20 L100,100 L0,100 Z" fill="#D8BFD8" />
      </Svg>

      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerText}>Registration Page</Text>
        </View>

        <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false}>
          <View style={styles.scrollContainer}>
            {/* Rate Limit Notice */}
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle" size={20} color="#6B46C1" style={styles.noticeIcon} />
              <Text style={styles.noticeText}>
                Please fill the form carefully. Multiple registration attempts may trigger a security cooldown.
              </Text>
            </View>

            <View style={styles.formContainer}>
              {/* Name */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={handleNameChange}
                  placeholder="Enter your full name"
                  placeholderTextColor="#a8a8a8"
                  autoCapitalize="words"
                />

              </View>

              {/* Email */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={handleEmailChange}
                  placeholder="e.g., name@gmail.com"
                  placeholderTextColor="#a8a8a8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

              </View>

              {/* Phone */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  placeholder="Enter 10-digit phone number"
                  placeholderTextColor="#a8a8a8"
                  keyboardType="phone-pad"
                  maxLength={10}
                />

              </View>

              {/* Username */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Username *</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={handleUsernameChange}
                  placeholder="Choose a username"
                  placeholderTextColor="#a8a8a8"
                  autoCapitalize="none"
                />

              </View>

              {/* Registration Number */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Registration Number *</Text>
                <TextInput
                  style={styles.input}
                  value={registrationNumber}
                  onChangeText={handleRegistrationChange}
                  placeholder="Enter your registration number"
                  placeholderTextColor="#a8a8a8"
                  keyboardType="numeric"
                />

              </View>

              {/* Course */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Course/Program *</Text>
                <TouchableOpacity onPress={() => setCourseModalVisible(true)} style={styles.selectCourseButton}>
                  <Text style={[styles.inputText, { color: course ? '#333' : '#a8a8a8' }]}>{'Faculty of ' + course.toLowerCase() || 'Select your course or program'}</Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Date of Birth - Google Style */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Date of Birth *</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>

                  {/* Month Dropdown */}
                  <View style={{ flex: 2 }}>
                    <Picker
                      selectedValue={selectedMonth}
                      onValueChange={(itemValue: string) => setSelectedMonth(itemValue)}
                      style={styles.dobPicker}
                    >
                      <Picker.Item label="Month" value="" />
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                        <Picker.Item
                          key={month}
                          label={`${String(month).padStart(2, '0')} - ${new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' })}`}
                          value={String(month)}   // <-- must be string because selectedValue is string
                        />
                      ))}
                    </Picker>
                  </View>

                  {/* Day */}
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.dobInput}
                      placeholder="Day"
                      value={selectedDay}
                      onChangeText={(text) => {
                        const num = text.replace(/[^0-9]/g, '').slice(0, 2);
                        setSelectedDay(num);
                      }}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                  </View>

                  {/* Year */}
                  <View style={{ flex: 1.5 }}>
                    <TextInput
                      style={styles.dobInput}
                      placeholder="Year"
                      value={selectedYear}
                      onChangeText={(text) => {
                        const num = text.replace(/[^0-9]/g, '').slice(0, 4);
                        setSelectedYear(num);
                      }}
                      keyboardType="numeric"
                      maxLength={4}
                    />
                  </View>
                </View>

                {/* Preview */}
                {selectedMonth && selectedDay && selectedYear && (
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 5, alignSelf: 'flex-end' }}>
                    → {selectedDay}/{selectedMonth.padStart(2, '0')}/{selectedYear}
                  </Text>
                )}
              </View>


              {/* Password */}
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Password *</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create a password (min 6 characters)"
                    placeholderTextColor="#a8a8a8"
                    secureTextEntry={!passwordVisible}
                  />
                  <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)} style={styles.passwordToggle}>
                    <Ionicons name={passwordVisible ? 'eye-off' : 'eye'} size={24} color="#666" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Register Button */}
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  loading && styles.registerButtonDisabled   // ← add disabled style when loading
                ]}
                onPress={signUpWithEmail}
                disabled={loading}                        // ← disable button while loading
              >
                <Text style={styles.registerButtonText}>
                  {loading ? 'Registering...' : 'Register'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Course Modal */}
      <Modal visible={courseModalVisible} transparent={true} animationType="slide" onRequestClose={() => setCourseModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Faculty</Text>
              <TouchableOpacity onPress={() => setCourseModalVisible(false)}>
                <Ionicons name="close" size={28} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: '100%' }}>
              {Object.entries(FACULTY).map(([key, facultyName], index) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    setCourse(key);
                    setCourseModalVisible(false);
                  }}
                  style={[styles.courseItem, course === key && { backgroundColor: Colors.accentLight }]}
                >
                  <Text style={[styles.courseText, course === key && { color: Colors.primary, fontWeight: 'bold' }]}>
                    {index + 1}. {facultyName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex1: { flex: 1 },
  svg: { position: 'absolute', top: '20%' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, paddingBottom: 15, backgroundColor: 'transparent' },
  backButton: { backgroundColor: Colors.white, paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, marginRight: 15, elevation: 4, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, borderWidth: 2, borderColor: Colors.primary },
  backButtonText: { color: Colors.primary, fontSize: 10, fontWeight: 'bold' },
  headerText: { color: Colors.white, fontSize: 30, fontWeight: 'bold', flex: 1, textShadowColor: Colors.black, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 3 },
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 30 },
  formContainer: { backgroundColor: 'white', borderRadius: 20, padding: 25, marginTop: 20, elevation: 8, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  inputWrapper: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.primary, marginBottom: 8 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', color: '#000000' },
  hint: { fontSize: 11, color: '#666', marginTop: 4, fontStyle: 'italic' },
  selectCourseButton: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e0e0e0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputText: { fontSize: 16, flex: 1 },
  passwordWrapper: { position: 'relative', color: 'black' },
  passwordToggle: { position: 'absolute', right: 12, top: 14, padding: 4, color: 'black' },
  registerButton: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 10, elevation: 3, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  registerButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  courseItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: 'white' },
  courseText: { fontSize: 16, color: '#333' },
  registerButtonDisabled: {
    backgroundColor: '#a680c8',   // a muted version of your primary color (or use Colors.primary + opacity)
    opacity: 0.7,
  },
  noticeBox: {
    backgroundColor: '#F3E5FF',
    borderRadius: 12,
    padding: 15,
    marginTop: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8BFD8',
  },
  noticeIcon: {
    marginRight: 10,
  },
  noticeText: {
    fontSize: 13,
    color: '#6B46C1',
    flex: 1,
    lineHeight: 18,
  },
  dobPicker: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    height: 50,
  },
  dobInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    height: 50,
  },
});