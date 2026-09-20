import { useRef, useState, type DragEvent } from "react";
import { Icon } from "./Icon";

export type FileUploadProps = {
  onFile: (file: File) => void;
  accept?: string;
  hint?: string;
  label?: string;
  className?: string;
};

export function FileUpload({ onFile, accept, hint, label = "Drop a file here or click to choose", className }: FileUploadProps): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);

  const pick = (file: File | undefined | null) => {
    if (!file) return;
    setName(file.name);
    onFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`fid-upload${over ? " fid-upload--over" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ref.current?.click();
        }
      }}
    >
      <span className="fid-upload__icon">
        <Icon name="upload" size={20} />
      </span>
      <span className="fid-upload__title">{name ?? label}</span>
      {hint ? <span className="fid-upload__hint">{hint}</span> : null}
      <input
        ref={ref}
        type="file"
        accept={accept}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default FileUpload;
