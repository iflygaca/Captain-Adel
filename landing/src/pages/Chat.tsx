import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Chat from '../components/Chat/Chat';
import { useAuth } from '../hooks/useAuth';
import styles from './Chat.module.css';

interface ChatPageProps {
  apiUrl?: string;
}

/**
 * Chat page component for Captain Adel flight instructor interface.
 * Handles authentication, routing, and integration with the backend SSE API.
 */
export default function ChatPage({ apiUrl = '/api/chat' }: ChatPageProps) {
  const navigate = useNavigate();
  const { isAuthenticated, user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  const handleClearChat = () => {
    // Optional: could trigger a reload or send clear signal to server
    window.location.reload();
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className={styles.errorContainer}>
        <p>Please log in to access the chat interface.</p>
      </div>
    );
  }

  return (
    <div className={styles.chatPage}>
      <Chat
        tenantId={user.tenantId}
        apiUrl={apiUrl}
        onClearChat={handleClearChat}
      />
      {error && (
        <div className={styles.errorBanner}>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
