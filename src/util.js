export const defaultExpiryDate = () => {
  const now = new Date();
  now.setFullYear(now.getFullYear() + 1);
  return now.toISOString().split("T")[0];
};