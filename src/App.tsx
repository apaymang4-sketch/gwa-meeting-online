import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  Camera,
  CameraOff,
  Copy,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Plus,
  Send,
  UserRound,
  Video,
} from "lucide-react";
import { auth, db, isFirebaseConfigured } from "./firebase";
import type { ChatMessage, MeetingRoom } from "./types";

const JITSI_DOMAIN = "meet.jit.si";
const ROOM_PREFIX = "gwa-meeting-online";

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function roomNameFromCode(code: string) {
  return `${ROOM_PREFIX}-${code.toLowerCase()}`;
}

function readCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
}

function formatFirebaseError(error: unknown) {
  if (!(error instanceof Error)) return "Terjadi kesalahan.";
  return error.message.replace("Firebase: ", "").replace(/\(.+\)\.?$/, ".");
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  if (!isFirebaseConfigured || !auth || !db) {
    return <SetupNotice />;
  }

  if (!authReady) {
    return <div className="center-screen">Memuat aplikasi...</div>;
  }

  return user ? <MeetingApp user={user} /> : <AuthView />;
}

function SetupNotice() {
  return (
    <main className="setup-shell">
      <section className="setup-panel">
        <Video size={36} />
        <h1>GWA Meeting Online</h1>
        <p>
          Firebase belum dikonfigurasi. Buat file <code>.env</code> dari
          <code>.env.example</code>, isi config Firebase Web App, lalu aktifkan
          Authentication Email/Password dan Firestore.
        </p>
      </section>
    </main>
  );
}

function AuthView() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;

    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, {
          displayName: name.trim() || email.split("@")[0],
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(formatFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">
          <Video size={34} />
        </div>
        <h1>GWA Meeting Online</h1>
        <p>Masuk untuk membuat room meeting, membagikan kode, dan melakukan panggilan video.</p>

        <div className="segmented" role="tablist" aria-label="Mode autentikasi">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Daftar
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Nama
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" disabled={loading}>
            <UserRound size={18} />
            {loading ? "Memproses..." : mode === "login" ? "Login" : "Buat Akun"}
          </button>
        </form>
      </section>
    </main>
  );
}

function MeetingApp({ user }: { user: User }) {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<MeetingRoom | null>(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [joinCode, setJoinCode] = useState(readCodeFromUrl());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) return;

    const roomsQuery = query(collection(db, "rooms"), orderBy("createdAt", "desc"), limit(12));
    return onSnapshot(roomsQuery, (snapshot) => {
      setRooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as MeetingRoom));
    });
  }, []);

  useEffect(() => {
    const urlCode = readCodeFromUrl();
    if (urlCode) void joinRoom(urlCode);
  }, []);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!db) return;

    setError("");
    const code = makeCode();
    const payload = {
      code,
      name: roomTitle.trim() || `Meeting ${code}`,
      hostUid: user.uid,
      hostName: user.displayName || user.email || "Host",
      createdAt: serverTimestamp(),
    };

    try {
      const roomRef = await addDoc(collection(db, "rooms"), payload);
      const room = { id: roomRef.id, ...payload } as MeetingRoom;
      setRoomTitle("");
      openRoom(room);
    } catch (err) {
      setError(formatFirebaseError(err));
    }
  }

  async function joinRoom(rawCode = joinCode) {
    if (!db) return;

    setError("");
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return;

    try {
      const roomQuery = query(collection(db, "rooms"), where("code", "==", code), limit(1));
      const snapshot = await getDocs(roomQuery);
      if (snapshot.empty) {
        setError("Room tidak ditemukan.");
        return;
      }

      const roomDoc = snapshot.docs[0];
      openRoom({ id: roomDoc.id, ...roomDoc.data() } as MeetingRoom);
    } catch (err) {
      setError(formatFirebaseError(err));
    }
  }

  function openRoom(room: MeetingRoom) {
    setActiveRoom(room);
    setJoinCode(room.code);
    window.history.replaceState({}, "", `?room=${room.code}`);
  }

  function leaveRoom() {
    setActiveRoom(null);
    window.history.replaceState({}, "", window.location.pathname);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="app-title">
            <Video size={26} />
            <span>GWA Meeting</span>
          </div>
          <p className="signed-in">Login sebagai {user.displayName || user.email}</p>
        </div>

        <form className="room-form" onSubmit={createRoom}>
          <label>
            Nama room
            <input
              placeholder="Rapat tim pagi"
              value={roomTitle}
              onChange={(event) => setRoomTitle(event.target.value)}
            />
          </label>
          <button className="primary-button">
            <Plus size={18} />
            Buat Room
          </button>
        </form>

        <form
          className="room-form"
          onSubmit={(event) => {
            event.preventDefault();
            void joinRoom();
          }}
        >
          <label>
            Kode room
            <input
              placeholder="ABC123"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            />
          </label>
          <button className="secondary-button">Join</button>
        </form>

        {error && <p className="error-text">{error}</p>}

        <div className="room-list">
          <h2>Room terbaru</h2>
          {rooms.map((room) => (
            <button
              className={activeRoom?.id === room.id ? "room-item active" : "room-item"}
              key={room.id}
              onClick={() => openRoom(room)}
            >
              <span>{room.name}</span>
              <strong>{room.code}</strong>
            </button>
          ))}
        </div>

        <button className="ghost-button" onClick={() => auth && signOut(auth)}>
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <section className="meeting-workspace">
        {activeRoom ? (
          <ActiveMeeting room={activeRoom} user={user} onLeave={leaveRoom} />
        ) : (
          <div className="empty-state">
            <Video size={52} />
            <h1>Pilih atau buat room meeting</h1>
            <p>Setelah room aktif, video, audio, screen share, dan chat akan muncul di sini.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ActiveMeeting({
  room,
  user,
  onLeave,
}: {
  room: MeetingRoom;
  user: User;
  onLeave: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);

  const inviteUrl = useMemo(() => `${window.location.origin}${window.location.pathname}?room=${room.code}`, [room.code]);

  useEffect(() => {
    if (!db) return;
    const messagesQuery = query(
      collection(db, "rooms", room.id, "messages"),
      orderBy("createdAt", "asc"),
      limit(80),
    );

    return onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ChatMessage));
    });
  }, [room.id]);

  useEffect(() => {
    let disposed = false;

    async function mountJitsi() {
      await loadJitsiScript();
      if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;

      apiRef.current?.dispose();
      containerRef.current.innerHTML = "";

      const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName: roomNameFromCode(room.code),
        parentNode: containerRef.current,
        userInfo: {
          displayName: user.displayName || user.email || "Peserta",
          email: user.email || undefined,
        },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: false,
          startWithVideoMuted: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
        },
      });

      api.addListener("audioMuteStatusChanged", (event) => {
        const payload = event as { muted?: boolean };
        setMicMuted(Boolean(payload.muted));
      });
      api.addListener("videoMuteStatusChanged", (event) => {
        const payload = event as { muted?: boolean };
        setCameraMuted(Boolean(payload.muted));
      });
      apiRef.current = api;
    }

    void mountJitsi();

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [room.code, user.displayName, user.email]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!db || !messageText.trim()) return;

    await addDoc(collection(db, "rooms", room.id, "messages"), {
      text: messageText.trim(),
      uid: user.uid,
      displayName: user.displayName || user.email || "Peserta",
      createdAt: serverTimestamp(),
    });
    setMessageText("");
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <div className="meeting-layout">
      <header className="meeting-header">
        <div>
          <h1>{room.name}</h1>
          <p>
            Kode <strong>{room.code}</strong>
          </p>
        </div>
        <button className="icon-text-button" onClick={copyInvite} title="Salin link undangan">
          <Copy size={18} />
          Link
        </button>
      </header>

      <div className="video-stage">
        <div className="jitsi-container" ref={containerRef} />
      </div>

      <div className="meeting-controls">
        <button
          className="control-button"
          onClick={() => apiRef.current?.executeCommand("toggleAudio")}
          title={micMuted ? "Unmute mic" : "Mute mic"}
        >
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button
          className="control-button"
          onClick={() => apiRef.current?.executeCommand("toggleVideo")}
          title={cameraMuted ? "Nyalakan kamera" : "Matikan kamera"}
        >
          {cameraMuted ? <CameraOff size={20} /> : <Camera size={20} />}
        </button>
        <button
          className="control-button"
          onClick={() => apiRef.current?.executeCommand("toggleShareScreen")}
          title="Share screen"
        >
          <MonitorUp size={20} />
        </button>
        <button className="danger-button" onClick={onLeave} title="Keluar room">
          <PhoneOff size={20} />
        </button>
      </div>

      <aside className="chat-panel">
        <div className="chat-title">
          <MessageSquare size={18} />
          <span>Chat</span>
        </div>
        <div className="messages">
          {messages.map((message) => (
            <div className={message.uid === user.uid ? "message own" : "message"} key={message.id}>
              <strong>{message.displayName}</strong>
              <p>{message.text}</p>
            </div>
          ))}
        </div>
        <form className="chat-form" onSubmit={sendMessage}>
          <input
            placeholder="Tulis pesan..."
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
          />
          <button title="Kirim pesan">
            <Send size={18} />
          </button>
        </form>
      </aside>
    </div>
  );
}

function loadJitsiScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-jitsi-api]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://${JITSI_DOMAIN}/external_api.js`;
    script.async = true;
    script.dataset.jitsiApi = "true";
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
