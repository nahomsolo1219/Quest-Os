export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-danger">{message}</p> : null;
}
