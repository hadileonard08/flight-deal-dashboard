import ChatPage from '@/components/chat/ChatPage';
import SplashRedirect from '@/components/SplashRedirect';

export default function Home() {
  return (
    <SplashRedirect>
      <ChatPage />
    </SplashRedirect>
  );
}
