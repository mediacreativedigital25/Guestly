export async function sendFonnteMessage(token: string, target: string, message: string) {
  if (!token) {
    console.warn("Fonnte token is missing, cannot send message.");
    return false;
  }
  
  if (!target) {
    console.warn("Target phone number is missing, cannot send message.");
    return false;
  }

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
      },
      body: new URLSearchParams({
        target,
        message,
      }),
    });

    const data = await response.json();
    if (data.status) {
      console.log("Fonnte message sent successfully:", data);
      return true;
    } else {
      console.error("Fonnte error:", data);
      return false;
    }
  } catch (error) {
    console.error("Fonnte connection error:", error);
    return false;
  }
}
