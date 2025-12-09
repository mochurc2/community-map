import React, { useMemo } from "react";

const parseMarkdown = (markdown) => {
  const lines = (markdown || "").split(/\r?\n/);
  const elements = [];
  let listBuffer = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul className="policy-list" key={`list-${key++}`}>
        {listBuffer.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 className="policy-heading" key={`h2-${key++}`}>
          {trimmed.slice(2).trim()}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 className="policy-subheading" key={`h3-${key++}`}>
          {trimmed.slice(3).trim()}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 className="policy-subheading" key={`h4-${key++}`}>
          {trimmed.slice(4).trim()}
        </h4>
      );
      continue;
    }

    if (trimmed.startsWith("- ") || /^\d+\.\s+/.test(trimmed)) {
      const item = trimmed.replace(/^-+\s*/, "").replace(/^\d+\.\s*/, "");
      listBuffer.push(item);
      continue;
    }

    flushList();
    elements.push(
      <p className="policy-paragraph" key={`p-${key++}`}>
        {trimmed}
      </p>
    );
  }

  flushList();
  return elements;
};

function PolicyModal({ title, content, onClose }) {
  const parsedContent = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="policy-overlay" role="dialog" aria-modal="true" aria-label={`${title} content`}>
      <div className="policy-backdrop" onClick={onClose} />
      <div className="policy-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="close-button" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body policy-content">{parsedContent}</div>
        <div className="modal-footer">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PolicyModal;
