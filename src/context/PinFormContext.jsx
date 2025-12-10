/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

/**
 * Context for pin form state and handlers
 * Used by AddPinPanel and its sub-components
 */
const PinFormContext = createContext(null);

export function usePinFormContext() {
  const context = useContext(PinFormContext);
  if (!context) {
    throw new Error('usePinFormContext must be used within a PinFormProvider');
  }
  return context;
}

export function PinFormProvider({ children, value }) {
  return (
    <PinFormContext.Provider value={value}>
      {children}
    </PinFormContext.Provider>
  );
}

export default PinFormContext;
