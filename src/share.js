export function isShareCanceledError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  if (error.code === "ERR_CANCELED" || error.code === "ERR_CANCELLED") return true;

  const message = String(error.message || error).toLowerCase();
  return message.includes("cancelled")
    || message.includes("canceled")
    || message.includes("cancelled share")
    || message.includes("canceled share")
    || message.includes("share canceled")
    || message.includes("share cancelled");
}
