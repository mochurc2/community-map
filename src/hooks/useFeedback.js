import { useState } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Hook to manage feedback modal state and submission
 */
export function useFeedback() {
  const [feedbackPrompt, setFeedbackPrompt] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [feedbackStatus, setFeedbackStatus] = useState(null);

  const openFeedback = (kind, details = {}) => {
    setFeedbackPrompt({ kind, ...details });
    setFeedbackMessage("");
    setFeedbackContact("");
    setFeedbackError(null);
    setFeedbackStatus(null);
  };

  const closeFeedback = () => {
    setFeedbackPrompt(null);
  };

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();
    if (!feedbackPrompt) return;

    const trimmedMessage = feedbackMessage.trim();
    if (!trimmedMessage) {
      setFeedbackError("Please add a message before sending.");
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackError(null);
    setFeedbackStatus(null);

    const payload = {
      kind: feedbackPrompt.kind,
      message: trimmedMessage,
      contact_info: feedbackContact.trim() || null,
      pin_id: feedbackPrompt.pinId || null,
      status: "open",
    };

    const { error } = await supabase.from("messages").insert(payload);

    if (error) {
      console.error(error);
      setFeedbackError(error.message);
    } else {
      setFeedbackStatus("Thanks for your note! A moderator will review it soon.");
      setFeedbackMessage("");
      setFeedbackContact("");
    }

    setFeedbackSubmitting(false);
  };

  return {
    feedbackPrompt,
    feedbackMessage,
    feedbackContact,
    feedbackSubmitting,
    feedbackError,
    feedbackStatus,
    openFeedback,
    closeFeedback,
    setFeedbackMessage,
    setFeedbackContact,
    handleFeedbackSubmit,
  };
}

export default useFeedback;
