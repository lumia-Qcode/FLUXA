export interface LivePollOption {
  index: number;
  text: string;
  votes: number;
  percentage: number;
}

export interface LivePoll {
  id: string;
  slide_index: number;
  question: string;
  options: LivePollOption[];
  total_votes: number;
  has_voted?: boolean;
  voted_option?: number | null;
  status: "active" | "closed";
}

export interface LiveComment {
  id: string;
  participant_id?: string;
  participant_name: string;
  slide_index: number;
  text: string;
  reaction?: string;
  created_at?: string;
}

export interface LiveParticipant {
  id: string;
  name: string;
  avatar_color: string;
  role: "moderator" | "viewer";
}

export interface LiveSessionState {
  session_id: string;
  presentation_id: number;
  presentation_title?: string;
  meeting_code: string;
  current_slide_index: number;
  status: "active" | "ended";
  participants_count: number;
  active_poll?: LivePoll | null;
  host_token?: string;
}

export async function startLiveSession(
  presentationId: number | string,
  hostName: string = "Presenter"
): Promise<LiveSessionState & { host_token: string; participant_id: string }> {
  const res = await fetch("/api/live/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presentation_id: presentationId, host_name: hostName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to start live session");
  }
  return res.json();
}

export async function getLiveSession(sessionId: string): Promise<LiveSessionState> {
  const res = await fetch(`/api/live/sessions/${sessionId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get live session");
  }
  return res.json();
}

export async function getSessionByCode(code: string): Promise<{ session_id: string; presentation_id: number; meeting_code: string; title: string }> {
  const res = await fetch(`/api/live/by-code/${encodeURIComponent(code)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Invalid meeting code");
  }
  return res.json();
}

export interface PrivacyNotice {
  version: number;
  retentionDays: number;
  text: string;
}

/** The audience privacy notice for a live session (F15). */
export async function fetchPrivacyNotice(sessionId: string): Promise<PrivacyNotice> {
  const res = await fetch(`/api/privacy/notice?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error("Couldn't load the privacy notice");
  return res.json();
}

/** Delete everything this attendee contributed to the session (name, votes, comments). */
export async function eraseMyLiveData(sessionId: string, participantId: string): Promise<void> {
  const res = await fetch(`/api/privacy/participant/erase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, participant_id: participantId }),
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Couldn't delete your data");
  }
}

/** Join as an attendee. Joining records that the attendee was shown `noticeVersion` of the notice. */
export async function joinLiveSession(
  sessionId: string,
  name: string,
  avatarColor?: string,
  noticeVersion: number = 1
): Promise<{ participant_id: string; session_id: string; name: string; avatar_color: string; role: string }> {
  const res = await fetch(`/api/live/sessions/${sessionId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, avatar_color: avatarColor, accept_notice: true, notice_version: noticeVersion }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to join live session");
  }
  return res.json();
}

export async function pingLiveSession(
  sessionId: string,
  participantId?: string
): Promise<{ current_slide_index: number; status: "active" | "ended"; participants_count: number; active_poll: LivePoll | null }> {
  const res = await fetch(`/api/live/sessions/${sessionId}/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participant_id: participantId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Ping failed");
  }
  return res.json();
}

export async function syncSlideIndex(sessionId: string, slideIndex: number, hostToken?: string): Promise<void> {
  await fetch(`/api/live/sessions/${sessionId}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_slide_index: slideIndex, host_token: hostToken }),
  });
}

export async function endLiveSession(sessionId: string, hostToken?: string): Promise<void> {
  await fetch(`/api/live/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host_token: hostToken }),
  });
}

export async function getLiveParticipants(sessionId: string): Promise<LiveParticipant[]> {
  const res = await fetch(`/api/live/sessions/${sessionId}/participants`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.participants || [];
}

export async function getHostInfo(): Promise<{ local_ip: string; lan_ip: string }> {
  try {
    const res = await fetch("/api/live/host-info");
    if (res.ok) return res.json();
  } catch (err) {
    // silent
  }
  return { local_ip: "127.0.0.1", lan_ip: "127.0.0.1" };
}

export async function createLivePoll(
  sessionId: string,
  slideIndex: number,
  question: string,
  options: string[]
): Promise<LivePoll> {
  const res = await fetch(`/api/live/sessions/${sessionId}/polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slide_index: slideIndex, question, options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create poll");
  }
  return res.json();
}

export async function castPollVote(
  pollId: string,
  participantId: string,
  optionIndex: number
): Promise<{ poll_id: string; options: LivePollOption[]; total_votes: number; has_voted: boolean; voted_option: number }> {
  const res = await fetch(`/api/live/polls/${pollId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participant_id: participantId, option_index: optionIndex }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to cast vote");
  }
  return res.json();
}

export async function closeLivePoll(pollId: string): Promise<void> {
  await fetch(`/api/live/polls/${pollId}/close`, { method: "POST" });
}

export async function getLiveComments(sessionId: string): Promise<LiveComment[]> {
  const res = await fetch(`/api/live/sessions/${sessionId}/comments`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.comments || [];
}

export async function postLiveComment(
  sessionId: string,
  participantId: string,
  participantName: string,
  slideIndex: number,
  text?: string,
  reaction?: string
): Promise<LiveComment> {
  const res = await fetch(`/api/live/sessions/${sessionId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participant_id: participantId,
      participant_name: participantName,
      slide_index: slideIndex,
      text: text || "",
      reaction: reaction || "",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to post comment");
  }
  return res.json();
}
