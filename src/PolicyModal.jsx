import React from "react";

function PolicyModal({ title, content, onClose }) {
  return (
    <div className="policy-overlay" role="dialog" aria-modal="true">
      <div className="policy-backdrop" onClick={onClose} />
      <div className="policy-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="close-button" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body policy-content">
          <pre>{content}</pre>
        </div>
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
