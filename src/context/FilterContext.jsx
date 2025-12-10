/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

/**
 * Context for filter state and handlers
 * Used by FilterPanel and related components
 */
const FilterContext = createContext(null);

export function useFilterContext() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilterContext must be used within a FilterProvider');
  }
  return context;
}

export function FilterProvider({ children, value }) {
  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

export default FilterContext;
