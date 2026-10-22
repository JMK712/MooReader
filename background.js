const chapters = new Map();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "JH_TOGGLE" }, { frameId: 0 });
  } catch {
    // Chrome does not inject content scripts into unsupported pages.
  }
});

chrome.tabs.onRemoved.addListener((tabId) => chapters.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const tabId = sender.tab?.id;
  if (!tabId || !message || typeof message.type !== "string") return;

  if (message.type === "JH_CHAPTER") {
    const payload = message.payload;
    if (!payload || typeof payload.title !== "string" || typeof payload.html !== "string") return;
    chapters.set(tabId, payload);
    chrome.tabs.sendMessage(tabId, { type: "JH_CHAPTER", payload }, { frameId: 0 }).catch(() => {});
    reply({ ok: true });
    return;
  }

  if (message.type === "JH_GET_CHAPTER") {
    reply({ payload: chapters.get(tabId) || null });
    chrome.tabs.sendMessage(tabId, { type: "JH_CAPTURE_NOW" }).catch(() => {});
    return;
  }

  if (message.type === "JH_NEXT_CHAPTER") {
    chrome.tabs.sendMessage(tabId, { type: "JH_CLICK_NEXT" }).catch(() => {});
    reply({ ok: true });
  }
});
