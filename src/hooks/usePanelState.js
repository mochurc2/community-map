import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to manage panel state (which panel is open, placement, expanded state)
 */
export function usePanelState({ selectedLocation, hasSubmitted }) {
  const [activePanel, setActivePanel] = useState("info");
  const [panelPlacement, setPanelPlacement] = useState("side");
  const [showFullAddForm, setShowFullAddForm] = useState(false);
  const [titleCardHeight, setTitleCardHeight] = useState(0);
  const [titleCardBounds, setTitleCardBounds] = useState({ top: 0, bottom: 0, height: 0 });
  const titleCardRef = useRef(null);

  // Handle responsive panel placement
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 960px)");

    const handlePlacement = (isWideEnough) => {
      const placement = isWideEnough ? "side" : "bottom";

      setPanelPlacement((prev) => (prev === placement ? prev : placement));

      if (activePanel === "add") {
        if (!isWideEnough || hasSubmitted) {
          setShowFullAddForm(false);
        } else if (selectedLocation) {
          setShowFullAddForm(true);
        }
      }
    };

    handlePlacement(mediaQuery.matches);

    const handleChange = (event) => handlePlacement(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [activePanel, selectedLocation, hasSubmitted]);

  // Track title card height for positioning
  useEffect(() => {
    const node = titleCardRef.current;
    if (!node) return;

    const root = document.documentElement;
    const updateHeight = () => {
      const rect = node.getBoundingClientRect();
      const nextHeight = rect.height;
      setTitleCardHeight(nextHeight);
      setTitleCardBounds({ top: rect.top, bottom: rect.bottom, height: rect.height });
      root.style.setProperty("--title-card-height", `${nextHeight}px`);
    };

    updateHeight();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateHeight()) : null;
    resizeObserver?.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  const togglePanel = useCallback((panel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
    if (panel === "add") {
      const shouldExpand =
        panelPlacement !== "bottom" && Boolean(selectedLocation) && !hasSubmitted;
      setShowFullAddForm(shouldExpand);
    }
  }, [panelPlacement, selectedLocation, hasSubmitted]);

  const openAddPanel = useCallback(() => {
    setActivePanel("add");
    setShowFullAddForm(true);
  }, []);

  const closePanel = useCallback(() => setActivePanel(null), []);

  return {
    activePanel,
    panelPlacement,
    showFullAddForm,
    setShowFullAddForm,
    titleCardHeight,
    titleCardBounds,
    titleCardRef,
    togglePanel,
    openAddPanel,
    closePanel,
  };
}

export default usePanelState;
