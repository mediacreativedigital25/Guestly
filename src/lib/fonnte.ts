import { auth } from './firebase';

export async function sendFonnteMessage(token: string | null | undefined, target: string, message: string, url?: string) {
  if (!target) {
    console.warn("Target phone number is missing, cannot send message.");
    return false;
  }

  try {
    const user = auth.currentUser;
    let idToken = '';
    if (user) {
      idToken = await user.getIdToken();
    } else {
      console.warn("User is not authenticated, proceeding without token");
    }

    const response = await fetch("/api/send-whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        target,
        message,
        url,
      }),
    });

    const data = await response.json();
    if (response.ok && data.success) {
      console.log("WhatsApp message sent successfully via proxy:", data);
      return true;
    } else {
      console.error("WhatsApp proxy error:", data);
      return false;
    }
  } catch (error) {
    console.error("WhatsApp connection error:", error);
    return false;
  }
}
