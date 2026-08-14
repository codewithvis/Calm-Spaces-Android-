# 🌿 Calm Space App

Welcome to **Calm Space**, a modern mental wellness platform designed to provide a supportive environment for students, peer listeners, and mental health experts. Built with **React Native**, **Expo (SDK 55)**, and **Supabase**, Calm Space offers role-specific tools to manage mental well-being effectively.

---

## ✨ Key Features

- 🧘 **Personalized Experience**: Tailored dashboards for Students, Peer Listeners, and Experts.
- 💬 **AI-Powered Chatbot**: Get instant support and resources from our integrated mental health assistant.
- 📊 **Mood Tracking**: Visualize your emotional journey with interactive charts and insights.
- 📅 **Session Management**: Easily book and manage appointments with mental health professionals.
- 🔒 **Production-Grade Security**: 
  - **Row Level Security (RLS)**: Strict data isolation at the database level.
  - **Hardware Security**: Root and hook detection via `JailMonkey`.
  - **Secure Edge Functions**: Background operations like push notifications and account deletion are handled on the server.
- 📂 **Resource Library**: Access a curated collection of wellness articles, audios, and videos.

---

## 🛠️ Tech Stack

- **Frontend**: React Native, Expo (SDK 55), TypeScript, Expo Router
- **State Management**: React Context, TanStack Query (React Query)
- **Styling**: Native CSS, React Native Paper
- **Backend / Auth**: Supabase (Auth, PostgreSQL, Storage, Edge Functions)
- **Visuals**: React Native Skia, SVG, Chart Kit
- **Hardware Protection**: JailMonkey (Security hardening for production)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [npm](https://www.npmjs.com/)
- [Expo Go](https://expo.dev/go) app (for mobile testing)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/shawshank725/calm-space-app-final.git
   cd calm-space-app-final
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

---

## 🔐 Database & Security Setup (CRITICAL)

To ensure the application is production-ready, you **must** apply the security migrations provided in the `supabase/migrations/` directory.

### 1. Apply Migrations
Run the following files in your Supabase SQL Editor in this specific order:
1. `20260812_production_security_hardening.sql`: Enables RLS and secures core tables.
2. `20260812_community_privacy_fix.sql`: Migrates community features to UUIDs for better privacy.
3. `20260812_storage_security.sql`: Secures storage buckets and enforces file ownership.

### 2. Edge Functions
The app uses Supabase Edge Functions for secure operations. You must deploy these using the Supabase CLI:
```bash
supabase functions deploy send-push
supabase functions deploy delete-user-auth
```

---

## 🏃 Running the App

### Mobile App (Expo)
To start the Expo development server:
```bash
npm run dev
```

### Production Build
To generate a production-ready Android App Bundle (.aab):
```bash
npx eas build --platform android --profile production
```

---

## 📂 Project Structure

- `/app`: Root of the Expo Router, contains all screens and navigation logic.
- `/supabase`: Contains database migrations and Edge Functions.
- `/api`: Centralized API hooks and services (React Query).
- `/components`: Reusable UI components.
- `/hooks`: Custom React hooks for global logic.
- `/lib`: Utility libraries (Supabase client, logging, storage service).
- `/assets`: Images, fonts, and other static resources.
- `/providers`: Context providers for global state (Auth, Query).

---

## 🧪 Testing

The app includes unit and security tests. To run them:
```bash
npm run test
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*“Providing a safe space for your mental journey.”*
