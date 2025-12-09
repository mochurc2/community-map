import { createContext, useContext } from 'react';
import { useFeedback } from '../hooks/useFeedback';

const FeedbackContext = createContext(null);

/**
 * Provider component for feedback modal state and handlers
 */
export function FeedbackProvider({ children }) {
  const feedback = useFeedback();

  return (
    <FeedbackContext.Provider value={feedback}>
      {children}
    </FeedbackContext.Provider>
  );
}

/**
 * Hook to access feedback context
 * @returns {Object} Feedback state and handlers
 */
export function useFeedbackContext() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedbackContext must be used within a FeedbackProvider');
  }
  return context;
}
