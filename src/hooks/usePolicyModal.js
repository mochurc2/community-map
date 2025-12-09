import { useState } from "react";

/**
 * usePolicyModal Hook
 *
 * Manages policy modal state (Terms of Service or Privacy Policy).
 *
 * @returns {Object} Policy modal state and handlers
 * @returns {string|null} return.policyModal - Current policy type: 'tos', 'privacy', or null
 * @returns {Function} return.openPolicy - Function to open policy modal with type
 * @returns {Function} return.closePolicy - Function to close policy modal
 */
export function usePolicyModal() {
  const [policyModal, setPolicyModal] = useState(null);

  const openPolicy = (type) => setPolicyModal(type);
  const closePolicy = () => setPolicyModal(null);

  return {
    policyModal,
    openPolicy,
    closePolicy,
  };
}
