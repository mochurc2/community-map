import { useEffect } from 'react';

/**
 * Hook to track and update CSS custom property for viewport height
 * Handles mobile browsers where visual viewport differs from window.innerHeight
 */
export function useViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      root.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
    };

    updateViewportHeight();

    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);
}

export default useViewport;
