import { useState } from "react";

type Props = {
  onScan: () => Promise<string>;
  disabled?: boolean;
};

export default function AiScannerAction({ onScan, disabled = false }: Props) {
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  const scan = async () => {
    if (scanning || disabled) return;
    setScanning(true);
    setMessage("Scanning available market samples…");
    try {
      setMessage(await onScan());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The scan could not be completed.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="ai-scanner-control">
      <button type="button" className="ai-scanner-button" onClick={() => void scan()} disabled={disabled || scanning}>
        {scanning ? "Scanning.." : "AI Scanner"}
      </button>
      {message && <p className="ai-scanner-message" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}