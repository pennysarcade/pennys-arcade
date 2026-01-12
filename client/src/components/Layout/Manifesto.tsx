interface ManifestoProps {
  onClose: () => void
}

export default function Manifesto({ onClose }: ManifestoProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal manifesto-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>

        <h2>Penny's Manifesto</h2>

        <div className="manifesto-content">
          <p>
            The social spaces of the early internet were bound by shared obsessions.
            Communities formed because they wanted to, and in those spaces a kind of
            self-policing, anarchic freedom prevailed. They were chaotic, but they
            felt real and alive. By comparison, today's internet is stale; it's been
            sanitised, consolidated and siloed.
          </p>

          <p>
            Penny's Arcade is my attempt to build a third place optimised for fun
            and connection. This is a place to hang out, make friends and mash buttons.
            To the extent that anything here is monetised, it's to keep the lights on,
            not to hollow out the fundamentals in pursuit of infinite growth.
          </p>

          <div className="manifesto-signature">
            <span className="signature-dash">—</span>
            <span className="signature-name">Penny xox</span>
          </div>
        </div>
      </div>
    </div>
  )
}
