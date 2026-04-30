/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel, Modality } from "@google/genai";
import { 
  Camera, 
  Upload, 
  Leaf, 
  Droplets, 
  Sun, 
  Thermometer, 
  Info, 
  MessageSquare, 
  Send, 
  X, 
  ChevronRight,
  Loader2,
  Sprout,
  RefreshCw,
  Image as ImageIcon,
  Calendar,
  Bug,
  Plus,
  Trash2,
  LayoutDashboard,
  CheckCircle2,
  AlertCircle,
  Clock,
  LogOut,
  LogIn,
  Volume2,
  Square,
  Zap,
  Mic,
  MicOff,
  Home,
  Sparkles,
  ChevronLeft,
  Edit3,
  Save,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  updateDoc,
  User
} from './firebase';

// Initialize Gemini
const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process as any).env.GEMINI_API_KEY : '') || 'AIzaSyBH3qXeV5dEQj8hXITOudGInzmK0SNKBpA';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface PlantInfo {
  name: string;
  scientificName: string;
  description: string;
  care: {
    watering: string;
    sunlight: string;
    temperature: string;
    soil: string;
  };
  tips: string[];
}

interface GardenPlant {
  id: string;
  uid: string;
  name: string;
  scientificName?: string;
  plantingDate: string;
  reminders: {
    watering: number; // days
    fertilizing: number; // days
    pestControl: number; // days
  };
  lastWatered?: string;
  lastFertilized?: string;
  lastPestControl?: string;
  image?: string;
  notes?: string;
  status?: 'healthy' | 'recovering' | 'needs_attention';
}

interface DiagnosisResult {
  issue: string;
  type: 'pest' | 'disease';
  description: string;
  symptoms: string[];
  organicTreatment: {
    method: string;
    instructions: string;
  };
  chemicalTreatment: {
    method: string;
    instructions: string;
  };
}

interface SpaceDesignResult {
  originalImage: string;
  generatedImage: string;
  analysis: {
    lighting: string;
    type: string;
    suggestedPlants: string[];
    spots: string[];
    lightingReason?: string;
  };
}

type Tab = 'home' | 'identify' | 'garden' | 'diagnosis' | 'design';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [fastMode, setFastMode] = useState(true);
  
  // Identification State
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [plantInfo, setPlantInfo] = useState<PlantInfo | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showFullImage, setShowFullImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  
  // Garden State
  const [garden, setGarden] = useState<GardenPlant[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<GardenPlant | null>(null);
  const [showAddPlant, setShowAddPlant] = useState(false);
  const [newPlant, setNewPlant] = useState<Partial<GardenPlant>>({
    name: '',
    plantingDate: new Date().toISOString().split('T')[0],
    reminders: { watering: 3, fertilizing: 30, pestControl: 60 },
    notes: ''
  });

  // Diagnosis State
  const [diagnosisImage, setDiagnosisImage] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  // Design Space State
  const [spaceImage, setSpaceImage] = useState<string | null>(null);
  const [isDesigning, setIsDesigning] = useState(false);
  const [designResult, setDesignResult] = useState<SpaceDesignResult | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [spaceAspectRatio, setSpaceAspectRatio] = useState<string>("1:1");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const diagnosisInputRef = useRef<HTMLInputElement>(null);
  const spaceInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const nextAudioTimeRef = useRef<number>(0);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsContextRef = useRef<AudioContext | null>(null);

  const translations = {
    en: {
      appName: "BOTanist",
      welcome: "Welcome back",
      gardener: "Gardener",
      gardenStatusPerfect: "Your garden is looking perfect today.",
      gardenStatusThirsty: "Your garden is looking thirsty today.",
      totalPlants: "Total Plants",
      needsWater: "Needs Water",
      identify: "Identify",
      diagnose: "Diagnose",
      design: "Design Space",
      myGarden: "My Garden",
      startOver: "Start Over",
      uploadPhoto: "Upload or take a plant photo",
      uploadSpace: "Upload or take a space photo",
      analyzing: "Analyzing...",
      designing: "Designing your space...",
      aiDesigned: "AI DESIGNED",
      environmentAnalysis: "Environment Analysis",
      lighting: "Lighting",
      spaceType: "Space Type",
      aiRecommendations: "AI Recommendations",
      designControls: "Design Controls",
      viewFullImage: "View Full Image",
      chatWithBotanist: "Chat with BOTanist",
      signIn: "Sign In",
      signingIn: "Signing In...",
      signOut: "Sign Out",
      fastMode: "Fast Mode",
      highThinking: "High Thinking Mode",
      language: "Language",
      home: "Home",
      identifyTab: "Identify",
      diagnoseTab: "Diagnose",
      gardenTab: "Garden",
      designTab: "Design",
      notes: "Notes",
      plantingDate: "Planting Date",
      reminders: "Reminders",
      watering: "Watering",
      fertilizing: "Fertilizing",
      pestControl: "Pest Control",
      healthy: "Healthy",
      sick: "Sick",
      dormant: "Dormant",
      addPlant: "Add New Plant",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      noPlants: "No plants in your garden yet.",
      addYourFirst: "Add your first plant to start tracking!",
      diagnoseTitle: "Plant Doctor",
      diagnoseDesc: "Upload a photo of a sick plant. Our AI will diagnose the issue and suggest a treatment plan.",
      designTitle: "AI Space Designer",
      designDesc: "Upload a photo of your room, balcony, or garden. Our AI will analyze the light and layout to design the perfect plant arrangement for you.",
      identifyTitle: "Plant Identifier",
      identifyDesc: "Snap a photo of any plant to identify it and get instant care instructions.",
    },
    hi: {
      appName: "BOTanist",
      welcome: "वापसी पर स्वागत है",
      gardener: "माली",
      gardenStatusPerfect: "आपका बगीचा आज बिल्कुल सही दिख रहा है।",
      gardenStatusThirsty: "आपका बगीचा आज प्यासा दिख रहा है।",
      totalPlants: "कुल पौधे",
      needsWater: "पानी की जरूरत",
      identify: "पहचानें",
      diagnose: "निदान",
      design: "स्थान डिज़ाइन",
      myGarden: "मेरा बगीचा",
      startOver: "फिर से शुरू करें",
      uploadPhoto: "पौधे की फोटो अपलोड करें या लें",
      uploadSpace: "स्थान की फोटो अपलोड करें या लें",
      analyzing: "विश्लेषण हो रहा है...",
      designing: "आपका स्थान डिज़ाइन किया जा रहा है...",
      aiDesigned: "AI द्वारा डिज़ाइन किया गया",
      environmentAnalysis: "पर्यावरण विश्लेषण",
      lighting: "प्रकाश",
      spaceType: "स्थान का प्रकार",
      aiRecommendations: "AI सिफारिशें",
      designControls: "डिज़ाइन नियंत्रण",
      viewFullImage: "पूरी फोटो देखें",
      chatWithBotanist: "BOTanist के साथ चैट करें",
      signIn: "साइन इन करें",
      signingIn: "साइन इन हो रहा है...",
      signOut: "साइन आउट",
      fastMode: "फास्ट मोड",
      highThinking: "उच्च सोच मोड",
      language: "भाषा",
      home: "होम",
      identifyTab: "पहचान",
      diagnoseTab: "निदान",
      gardenTab: "बगीचा",
      designTab: "डिज़ाइन",
      notes: "नोट्स",
      plantingDate: "रोपण की तारीख",
      reminders: "अनुस्मारक",
      watering: "सिंचाई",
      fertilizing: "खाद डालना",
      pestControl: "कीट नियंत्रण",
      healthy: "स्वस्थ",
      sick: "बीमार",
      dormant: "सुप्त",
      addPlant: "नया पौधा जोड़ें",
      save: "सहेजें",
      cancel: "रद्द करें",
      delete: "हटाएं",
      noPlants: "अभी आपके बगीचे में कोई पौधा नहीं है।",
      addYourFirst: "ट्रैकिंग शुरू करने के लिए अपना पहला पौधा जोड़ें!",
      diagnoseTitle: "प्लांट डॉक्टर",
      diagnoseDesc: "बीमार पौधे की फोटो अपलोड करें। हमारा AI समस्या का निदान करेगा और उपचार योजना सुझाएगा।",
      designTitle: "AI स्पेस डिज़ाइनर",
      designDesc: "अपने कमरे, बालकनी या बगीचे की फोटो अपलोड करें। हमारा AI प्रकाश और लेआउट का विश्लेषण करेगा और आपके लिए सही पौधों की व्यवस्था डिज़ाइन करेगा।",
      identifyTitle: "पौधा पहचानकर्ता",
      identifyDesc: "किसी भी पौधे की पहचान करने और तुरंत देखभाल निर्देश प्राप्त करने के लिए उसकी फोटो लें।",
    }
  };

  const t = translations[language];

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!isAuthReady || !user) {
      setGarden([]);
      return;
    }

    const q = query(collection(db, 'plants'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const plants = snapshot.docs.map(doc => doc.data() as GardenPlant);
      setGarden(plants);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'plants');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Sign in failed:", err);
      if (err.code === 'auth/popup-blocked') {
        setAuthError("Sign-in popup was blocked by your browser. Please allow popups for this site or try opening the app in a new tab.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // This often happens if multiple clicks occur, we can ignore it or show a subtle message
        console.warn("Popup request was cancelled.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        setAuthError("Sign-in was cancelled. Please try again.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setAuthError(`This domain is not authorized for sign-in. If you deployed to a new domain (like Vercel), you must add "${window.location.hostname}" to the "Authorized domains" list in your Firebase Console (Authentication > Settings).`);
      } else {
        setAuthError(`Sign-in failed: ${err.message || 'An unexpected error occurred'}. Please try again or open the app in a new tab.`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  const speakText = async (text: string, index: number) => {
    if (isSpeaking && playingMessageIndex === index) {
      if (ttsSourceRef.current) {
        try { ttsSourceRef.current.stop(); } catch(e) {}
        ttsSourceRef.current = null;
      }
      if (ttsContextRef.current) {
        try { ttsContextRef.current.close(); } catch(e) {}
        ttsContextRef.current = null;
      }
      setIsSpeaking(false);
      setPlayingMessageIndex(null);
      return;
    }

    // If something else is playing, stop it first
    if (isSpeaking) {
      if (ttsSourceRef.current) {
        try { ttsSourceRef.current.stop(); } catch(e) {}
        ttsSourceRef.current = null;
      }
      if (ttsContextRef.current) {
        try { ttsContextRef.current.close(); } catch(e) {}
        ttsContextRef.current = null;
      }
    }

    setIsSpeaking(true);
    setPlayingMessageIndex(index);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const pcmData = new Int16Array(bytes.buffer);

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        ttsContextRef.current = audioContext;

        const buffer = audioContext.createBuffer(1, pcmData.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < pcmData.length; i++) channelData[i] = pcmData[i] / 0x7FFF;

        const source = audioContext.createBufferSource();
        ttsSourceRef.current = source;

        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          setIsSpeaking(false);
          setPlayingMessageIndex(null);
          ttsSourceRef.current = null;
          if (ttsContextRef.current === audioContext) {
            audioContext.close();
            ttsContextRef.current = null;
          }
        };
        source.start();
      } else {
        setIsSpeaking(false);
        setPlayingMessageIndex(null);
      }
    } catch (err) {
      console.error("TTS failed:", err);
      setIsSpeaking(false);
      setPlayingMessageIndex(null);
    }
  };

  const startLiveSession = async () => {
    if (isLiveActive) return;
    setIsLiveActive(true);
    setVoiceError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      nextAudioTimeRef.current = audioContext.currentTime;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioWorkletNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!liveSessionRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        liveSessionRef.current.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are an expert botanist. The user is in a live voice conversation with you. Keep your responses concise, helpful, and natural for a spoken conversation. You are helping them with their garden.`,
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            setVoiceError(null);
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const pcmData = new Int16Array(bytes.buffer);
              
              // Playback
              if (audioContextRef.current) {
                const buffer = audioContextRef.current.createBuffer(1, pcmData.length, 16000);
                const channelData = buffer.getChannelData(0);
                for (let i = 0; i < pcmData.length; i++) channelData[i] = pcmData[i] / 0x7FFF;
                
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                
                const startTime = Math.max(audioContextRef.current.currentTime, nextAudioTimeRef.current);
                source.start(startTime);
                nextAudioTimeRef.current = startTime + buffer.duration;
              }
            }
            if (message.serverContent?.interrupted) {
              // Stop current playback
              nextAudioTimeRef.current = audioContextRef.current?.currentTime || 0;
            }
          },
          onclose: () => stopLiveSession(),
          onerror: (err) => {
            console.error("Live session error:", err);
            setVoiceError("Connection error. Please try again.");
            stopLiveSession();
          }
        }
      });
      liveSessionRef.current = session;
    } catch (err: any) {
      console.error("Failed to start live session:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('Permission dismissed')) {
        setVoiceError("Microphone access was denied or dismissed. Please allow microphone access in your browser settings to use voice chat.");
      } else {
        setVoiceError("Failed to start voice chat. Please check your microphone and try again.");
      }
      stopLiveSession();
    }
  };

  const stopLiveSession = () => {
    setIsLiveActive(false);
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const getClosestAspectRatio = (width: number, height: number) => {
    const ratio = width / height;
    const targets = [
      { label: "1:1", value: 1 / 1 },
      { label: "3:4", value: 3 / 4 },
      { label: "4:3", value: 4 / 3 },
      { label: "9:16", value: 9 / 16 },
      { label: "16:9", value: 16 / 9 },
    ];
    
    let closest = targets[0];
    let minDiff = Math.abs(ratio - closest.value);
    
    for (let i = 1; i < targets.length; i++) {
      const diff = Math.abs(ratio - targets[i].value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = targets[i];
      }
    }
    return closest.label;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'identify' | 'diagnosis' | 'design') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (type === 'identify') {
          setImage(base64);
          analyzeImage(base64);
        } else if (type === 'diagnosis') {
          setDiagnosisImage(base64);
          diagnosePlant(base64);
        } else {
          const img = new Image();
          img.onload = () => {
            const closestRatio = getClosestAspectRatio(img.width, img.height);
            setSpaceAspectRatio(closestRatio);
            setSpaceImage(base64);
            generateSpaceDesign(base64, closestRatio);
          };
          img.src = base64;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    setError(null);
    setPlantInfo(null);
    setChatHistory([]);
    chatRef.current = null;

    try {
      const base64Data = base64Image.split(',')[1];
      const modelName = thinkingMode ? "gemini-3.1-pro-preview" : (fastMode ? "gemini-3.1-flash-lite-preview" : "gemini-3.1-pro-preview");
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            {
              text: `Identify this plant with high precision. 
              First, describe its key botanical features: leaf shape, margin, venation, and stem structure.
              Then, provide detailed care instructions in JSON format. 
              The JSON should follow this structure:
              {
                "name": "Common Name",
                "scientificName": "Scientific Name",
                "description": "Brief description of the plant",
                "care": {
                  "watering": "Watering frequency and tips",
                  "sunlight": "Sunlight requirements",
                  "temperature": "Ideal temperature range",
                  "soil": "Soil type and drainage"
                },
                "tips": ["Tip 1", "Tip 2", "Tip 3"]
              }
              If it's not a plant, return an error message in a different JSON structure: {"error": "Message"}.`,
            },
          ],
        },
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: thinkingMode ? { thinkingLevel: ThinkingLevel.HIGH } : undefined
        }
      });

      const data = JSON.parse(response.text);
      if (data.error) {
        setError(data.error);
      } else {
        setPlantInfo(data);
        setChatHistory([{ role: 'model', text: `Hi! I've identified this as a **${data.name}** (${data.scientificName}). How can I help you care for it today?` }]);
      }
    } catch (err) {
      setError("Failed to analyze the image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const diagnosePlant = async (base64Image: string) => {
    setIsDiagnosing(true);
    setDiagnosisError(null);
    setDiagnosisResult(null);

    try {
      const base64Data = base64Image.split(',')[1];
      const modelName = thinkingMode ? "gemini-3.1-pro-preview" : (fastMode ? "gemini-3.1-flash-lite-preview" : "gemini-3.1-pro-preview");
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            {
              text: `Act as a professional plant pathologist. Analyze this plant photo for pests or diseases. 
              Examine leaf discoloration, spots, wilting, or unusual growth patterns.
              Provide a detailed diagnosis in JSON format:
              {
                "issue": "Name of pest or disease",
                "type": "pest" or "disease",
                "description": "Brief explanation of the problem",
                "symptoms": ["Symptom 1", "Symptom 2"],
                "organicTreatment": {
                  "method": "Name of organic treatment",
                  "instructions": "Detailed step-by-step application instructions"
                },
                "chemicalTreatment": {
                  "method": "Name of chemical treatment",
                  "instructions": "Detailed step-by-step application instructions"
                }
              }
              If no issue is found or it's not a plant, return {"error": "Message"}.`,
            },
          ],
        },
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: thinkingMode ? { thinkingLevel: ThinkingLevel.HIGH } : undefined
        }
      });

      const data = JSON.parse(response.text);
      if (data.error) {
        setDiagnosisError(data.error);
      } else {
        setDiagnosisResult(data);
      }
    } catch (err) {
      setDiagnosisError("Failed to diagnose. Please try again with a clearer photo.");
    } finally {
      setIsDiagnosing(false);
    }
  };

  const generateSpaceDesign = async (base64Image: string, aspectRatio: string = "1:1") => {
    setIsDesigning(true);
    setDesignError(null);
    setDesignResult(null);

    try {
      const base64Data = base64Image.split(',')[1];
      
      // Step 1: Analyze Space
      const analysisResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            {
              text: `Analyze this room or outdoor space (like a window, balcony, or garden) for plant placement. 
              Be extremely careful with lighting detection. Look for:
              - Distance from the nearest window.
              - Size and orientation of windows (if visible).
              - Presence of deep shadows or heavy curtains.
              - If the space is primarily lit by artificial light.
              
              Identify:
              1. Lighting level: Choose strictly from [Deep Shade, Low Light, Moderate Indirect, Bright Indirect, Direct Sun].
              2. Space type: [Indoor, Balcony, Garden, Window Sill, Patio].
              3. 3-5 specific spots for plants (e.g., "dim corner", "bookshelf away from window", "on the floor near the door").
              4. A list of 5 plants that would thrive specifically in the identified lighting level. 
                 - If Low Light/Deep Shade: Suggest Snake Plant, ZZ Plant, Pothos, Peace Lily, or Cast Iron Plant.
                 - If Bright/Direct: Suggest Succulents, Cacti, Bird of Paradise, or Fiddle Leaf Fig.
              
              Return ONLY a valid JSON object with this structure:
              {
                "lighting": "...",
                "type": "...",
                "spots": ["..."],
                "suggestedPlants": ["..."],
                "lightingReason": "Brief explanation of why you chose this lighting level"
              }`,
            },
          ],
        },
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: thinkingMode ? { thinkingLevel: ThinkingLevel.HIGH } : undefined
        }
      });

      let analysis;
      try {
        const text = analysisResponse.text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        analysis = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch (e) {
        console.error("Failed to parse analysis JSON:", e);
        throw new Error("Could not analyze the space layout.");
      }

      // Step 2: Generate Design
      const editPrompt = `Interior design enhancement: Add realistic, beautiful houseplants to this ${analysis.type}. 
      Target plants: ${analysis.suggestedPlants.join(', ')}.
      Placement: Naturally in ${analysis.spots.join(', ')}.
      Lighting: Ensure shadows and reflections match the ${analysis.lighting} environment.
      Style: Professional architectural photography, high definition, photorealistic.`;

      const generationResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            { text: editPrompt },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any
          }
        }
      });

      let generatedBase64 = '';
      for (const part of generationResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedBase64 = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (generatedBase64) {
        setDesignResult({
          originalImage: base64Image,
          generatedImage: generatedBase64,
          analysis: analysis
        });
      } else {
        setDesignError("The AI was unable to generate a visual for this space. The analysis was successful, but the image generation step timed out or was restricted. Please try a different photo or check your quota.");
      }
    } catch (err: any) {
      console.error("Design generation failed:", err);
      if (err.message?.includes('429') || err.message?.toLowerCase().includes('quota')) {
        setDesignError("AI service limit reached. This usually happens on free plans after multiple requests. Please wait a few minutes and try again.");
      } else {
        setDesignError("An error occurred while designing your space. Please ensure you have a stable connection and try again.");
      }
    } finally {
      setIsDesigning(false);
    }
  };

  // Context-aware Chat Initialization
  useEffect(() => {
    const chatModel = fastMode ? "gemini-3.1-flash-lite-preview" : "gemini-3-flash-preview";
    
    let context = `You are BOTanist, a friendly, expert AI gardening assistant. 
    Your personality is warm, encouraging, and professional. Use natural language, avoid being robotic.
    Do not overload users with too much information at once; keep advice concise and actionable.
    Adapt your behavior to the user's needs. If they seem like a beginner, explain basics. If they are experienced, provide more technical details.
    
    Current App Context:
    - Current Tab: ${activeTab}
    - User: ${user?.displayName || 'Guest'}
    `;

    if (plantInfo) {
      context += `\n- Currently viewing identified plant: ${plantInfo.name} (${plantInfo.scientificName}).`;
    }
    if (selectedPlant) {
      context += `\n- Currently viewing garden plant: ${selectedPlant.name} (${selectedPlant.scientificName}). Status: ${selectedPlant.status}.`;
    }
    if (diagnosisResult) {
      context += `\n- Currently viewing diagnosis: ${diagnosisResult.issue} (${diagnosisResult.type}).`;
    }
    if (designResult) {
      context += `\n- Currently viewing space design for a ${designResult.analysis.type} with ${designResult.analysis.lighting} lighting.`;
    }

    context += `\n\nKnowledge Base:
    - Lighting: Deep Shade to Direct Sun. Explain how to measure it.
    - Watering: Finger test, moisture meters, seasonal changes.
    - Soil: Drainage, pH, nutrients (NPK).
    - Pests/Diseases: Organic vs. chemical treatments.
    - Design: Aesthetics, grouping plants, pot selection.
    
    IMPORTANT: Respond in ${language === 'hi' ? 'Hindi' : 'English'}.`;

    chatRef.current = ai.chats.create({
      model: chatModel,
      config: {
        systemInstruction: context,
        thinkingConfig: { thinkingLevel: fastMode ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW }
      },
    });
  }, [activeTab, plantInfo, selectedPlant, diagnosisResult, designResult, fastMode, user, language]);

  const handleSendMessage = async (customMessage?: string) => {
    const messageText = customMessage || userInput;
    if (!messageText.trim() || isChatting || !chatRef.current) return;
    
    const newMessage: ChatMessage = { role: 'user', text: messageText };
    setChatHistory(prev => [...prev, newMessage]);
    if (!customMessage) setUserInput('');
    setIsChatting(true);
    setShowChat(true);
    
    try {
      const stream = await chatRef.current.sendMessageStream({ message: messageText });
      let fullText = '';
      
      // Add an empty model message to be updated
      setChatHistory(prev => [...prev, { role: 'model', text: '' }]);
      
      for await (const chunk of stream) {
        if (chunk.text) {
          fullText += chunk.text;
          setChatHistory(prev => {
            const newHistory = [...prev];
            newHistory[newHistory.length - 1] = { role: 'model', text: fullText };
            return newHistory;
          });
        }
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsChatting(false);
    }
  };

  const addToGarden = async (info: PlantInfo) => {
    if (!user) {
      handleSignIn();
      return;
    }
    const plantId = crypto.randomUUID();
    const plant: GardenPlant = {
      id: plantId,
      uid: user.uid,
      name: info.name,
      scientificName: info.scientificName,
      plantingDate: new Date().toISOString().split('T')[0],
      reminders: { watering: 3, fertilizing: 30, pestControl: 60 },
      image: image || undefined,
      status: 'healthy',
      notes: ''
    };
    
    try {
      await setDoc(doc(db, 'plants', plantId), plant);
      setActiveTab('garden');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'plants');
    }
  };

  const removeFromGarden = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'plants', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'plants');
    }
  };

  const updateReminder = async (id: string, type: 'lastWatered' | 'lastFertilized' | 'lastPestControl') => {
    try {
      await updateDoc(doc(db, 'plants', id), {
        [type]: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'plants');
    }
  };

  const calculateNextDate = (lastDate: string | undefined, plantingDate: string, frequency: number) => {
    const baseDate = new Date(lastDate || plantingDate);
    baseDate.setDate(baseDate.getDate() + frequency);
    return baseDate;
  };

  const isOverdue = (nextDate: Date) => {
    return nextDate < new Date();
  };

  const getOverduePlants = () => {
    return garden.filter(plant => {
      const nextWater = calculateNextDate(plant.lastWatered, plant.plantingDate, plant.reminders.watering);
      return isOverdue(nextWater);
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 pb-20 md:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-brand-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-200">
              <Leaf size={24} />
            </div>
            <h1 className="text-xl font-bold text-brand-900 hidden sm:block">{t.appName}</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
                className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-white rounded-lg transition-all"
                title={t.language}
              >
                {language === 'en' ? 'हिन्दी' : 'EN'}
              </button>
              <button 
                onClick={() => { setThinkingMode(!thinkingMode); if (!thinkingMode) setFastMode(false); }}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  thinkingMode ? "bg-brand-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
                title="High Thinking Mode"
              >
                <Zap size={18} />
              </button>
              <button 
                onClick={() => { setFastMode(!fastMode); if (!fastMode) setThinkingMode(false); }}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  fastMode ? "bg-amber-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
                title="Fast Mode"
              >
                <RefreshCw size={18} className={fastMode ? "animate-spin-slow" : ""} />
              </button>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <img src={user.photoURL || ''} alt="Profile" className="w-8 h-8 rounded-full border border-brand-100" />
                <button onClick={handleSignOut} className="text-slate-500 hover:text-red-500"><LogOut size={20} /></button>
              </div>
            ) : (
              <button 
                onClick={handleSignIn}
                disabled={isSigningIn}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-100",
                  isSigningIn ? "opacity-50 cursor-not-allowed" : "hover:bg-brand-700"
                )}
              >
                {isSigningIn ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {isSigningIn ? t.signingIn : t.signIn}
              </button>
            )}
          </div>
        </div>
        
        {/* API Key Missing Warning */}
        {!GEMINI_API_KEY && (
          <div className="bg-amber-600 text-white px-4 py-2 text-center text-xs font-bold uppercase tracking-wider">
            ⚠️ Gemini API Key is missing. Set GEMINI_API_KEY in your deployment environment variables.
          </div>
        )}
        
        {/* Auth Error Banner */}
        <AnimatePresence>
          {authError && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 border-b border-red-100 overflow-hidden"
            >
              <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                  <AlertCircle size={16} />
                  <span>{authError}</span>
                </div>
                <button 
                  onClick={() => setAuthError(null)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6">
        <AnimatePresence mode="wait">
          {/* HOME TAB */}
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="bg-brand-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-3xl font-bold mb-2">{t.welcome}, {user?.displayName?.split(' ')[0] || t.gardener}!</h2>
                  <p className="text-brand-200 text-lg mb-6">{getOverduePlants().length === 0 ? t.gardenStatusPerfect : t.gardenStatusThirsty}</p>
                  <div className="flex flex-wrap gap-4">
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                      <p className="text-xs text-brand-300 font-bold uppercase">{t.totalPlants}</p>
                      <p className="text-2xl font-bold">{garden.length}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                      <p className="text-xs text-brand-300 font-bold uppercase">{t.needsWater}</p>
                      <p className="text-2xl font-bold text-amber-400">{getOverduePlants().length}</p>
                    </div>
                  </div>
                </div>
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10 rotate-12">
                  <Leaf size={240} />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { id: 'identify', label: t.identify, icon: <Camera />, color: 'bg-blue-500' },
                  { id: 'diagnosis', label: t.diagnose, icon: <Bug />, color: 'bg-red-500' },
                  { id: 'design', label: t.design, icon: <Sparkles />, color: 'bg-purple-500' },
                  { id: 'garden', label: t.myGarden, icon: <LayoutDashboard />, color: 'bg-brand-600' },
                ].map(action => (
                  <button 
                    key={action.id}
                    onClick={() => setActiveTab(action.id as Tab)}
                    className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col items-center gap-3 group"
                  >
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white group-hover:scale-110 transition-transform", action.color)}>
                      {action.icon}
                    </div>
                    <span className="font-bold text-slate-700">{action.label}</span>
                  </button>
                ))}
              </div>

              {getOverduePlants().length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Droplets className="text-blue-500" /> Needs Water Today
                  </h3>
                  <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {getOverduePlants().map(plant => (
                      <div 
                        key={plant.id} 
                        onClick={() => { setSelectedPlant(plant); setActiveTab('garden'); }}
                        className="min-w-[200px] bg-white rounded-3xl border border-brand-100 p-4 shadow-sm cursor-pointer hover:border-brand-300 transition-all"
                      >
                        <div className="h-32 rounded-2xl overflow-hidden mb-3">
                          <img src={plant.image || 'https://picsum.photos/seed/plant/400/400'} alt={plant.name} className="w-full h-full object-cover" />
                        </div>
                        <h4 className="font-bold text-slate-900 truncate">{plant.name}</h4>
                        <p className="text-xs text-red-500 font-medium">Overdue</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* IDENTIFY TAB */}
          {activeTab === 'identify' && (
            <motion.div 
              key="identify"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!image ? (
                <div className="h-[calc(100vh-12rem)] flex flex-col items-center justify-center">
                  <div className="text-center mb-8 max-w-lg">
                    <h2 className="text-4xl font-bold text-slate-900 mb-4">Identify Any Plant</h2>
                    <p className="text-lg text-slate-600">Snap a photo to get instant identification and care guides.</p>
                  </div>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full max-w-md aspect-square bg-white border-2 border-dashed border-brand-200 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-all group"
                  >
                    <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 group-hover:scale-110 transition-transform">
                      <Camera size={40} />
                    </div>
                    <p className="font-semibold text-slate-900">Upload or take a photo</p>
                    <input type="file" ref={fileInputRef} onChange={(e) => handleImageUpload(e, 'identify')} accept="image/*" className="hidden" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-7 space-y-6">
                    <div className="relative rounded-3xl overflow-hidden shadow-xl bg-white aspect-video">
                      <img src={image} alt="Plant" className="w-full h-full object-cover" />
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                          <Loader2 size={48} className="animate-spin mb-4" />
                          <p className="text-xl font-medium">{t.analyzing}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="lg:col-span-5">
                    {plantInfo && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h2 className="text-3xl font-bold text-slate-900">{plantInfo.name}</h2>
                          <button 
                            onClick={() => addToGarden(plantInfo)}
                            className="bg-brand-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-brand-700 shadow-lg shadow-brand-200 transition-all"
                          >
                            <Plus size={20} /> {t.addPlant}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm">
                            <Droplets className="text-blue-500 mb-2" />
                            <p className="text-xs font-bold uppercase text-slate-400">{t.watering}</p>
                            <p className="text-sm text-slate-700">{plantInfo.care.watering}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm">
                            <Sun className="text-amber-500 mb-2" />
                            <p className="text-xs font-bold uppercase text-slate-400">{t.lighting}</p>
                            <p className="text-sm text-slate-700">{plantInfo.care.sunlight}</p>
                          </div>
                        </div>
                        <div className="bg-brand-900 text-white p-6 rounded-3xl">
                          <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Info size={20} /> Expert Tips</h3>
                          <ul className="space-y-2">
                            {plantInfo.tips.map((tip, i) => (
                              <li key={i} className="flex gap-2 text-sm text-brand-50"><ChevronRight size={16} className="mt-0.5" /> {tip}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* GARDEN TAB */}
          {activeTab === 'garden' && (
            <motion.div 
              key="garden"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {selectedPlant ? (
                <div className="space-y-6">
                  <button 
                    onClick={() => setSelectedPlant(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-brand-600 font-bold transition-colors"
                  >
                    <ChevronLeft size={20} /> {language === 'hi' ? 'बगीचे में वापस जाएं' : 'Back to Garden'}
                  </button>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-5 space-y-6">
                      <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl aspect-square bg-white">
                        <img src={selectedPlant.image || 'https://picsum.photos/seed/plant/800/800'} alt={selectedPlant.name} className="w-full h-full object-cover" />
                        <div className={cn(
                          "absolute top-6 right-6 px-4 py-1.5 rounded-full text-xs font-bold shadow-lg",
                          selectedPlant.status === 'healthy' ? "bg-green-500 text-white" : 
                          selectedPlant.status === 'recovering' ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                        )}>
                          {selectedPlant.status?.toUpperCase() || 'HEALTHY'}
                        </div>
                      </div>
                      
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                        <h3 className="text-xl font-bold text-slate-900">Care Reminders</h3>
                        <div className="space-y-3">
                          {[
                            { type: 'lastWatered', icon: <Droplets size={18} />, label: 'Watering', freq: selectedPlant.reminders.watering, color: 'blue' },
                            { type: 'lastFertilized', icon: <Sprout size={18} />, label: 'Fertilizing', freq: selectedPlant.reminders.fertilizing, color: 'green' },
                            { type: 'lastPestControl', icon: <Bug size={18} />, label: 'Pest Control', freq: selectedPlant.reminders.pestControl, color: 'purple' },
                          ].map((rem) => {
                            const nextDate = calculateNextDate(selectedPlant[rem.type as keyof GardenPlant] as string, selectedPlant.plantingDate, rem.freq);
                            const overdue = isOverdue(nextDate);
                            return (
                              <div key={rem.type} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                                <div className="flex items-center gap-3">
                                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", overdue ? "bg-red-100 text-red-600" : "bg-white text-slate-400 shadow-sm")}>
                                    {rem.icon}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase leading-none mb-1">{rem.label === 'Watering' ? t.watering : rem.label === 'Fertilizing' ? t.fertilizing : t.pestControl}</p>
                                    <p className={cn("font-bold", overdue ? "text-red-600" : "text-slate-700")}>
                                      {overdue ? (language === 'hi' ? 'विलंबित!' : 'Overdue!') : `${language === 'hi' ? 'अगला' : 'Next'}: ${nextDate.toLocaleDateString()}`}
                                    </p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => updateReminder(selectedPlant.id, rem.type as any)}
                                  className="bg-brand-600 text-white p-2 rounded-xl hover:bg-brand-700 transition-all shadow-lg shadow-brand-100"
                                >
                                  <CheckCircle2 size={20} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="lg:col-span-7 space-y-6">
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                        <div className="flex justify-between items-start">
                          <div>
                            <h2 className="text-4xl font-bold text-slate-900">{selectedPlant.name}</h2>
                            <p className="text-xl text-brand-600 italic">{selectedPlant.scientificName || 'Unknown Species'}</p>
                          </div>
                          <div className="flex gap-2">
                            <button className="p-2 text-slate-400 hover:text-brand-600 transition-colors"><Edit3 size={20} /></button>
                            <button onClick={() => removeFromGarden(selectedPlant.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                          </div>
                        </div>
                        
                        <div className="flex gap-4">
                          <div className="bg-slate-50 px-4 py-2 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{t.plantingDate}</p>
                            <p className="font-bold text-slate-700">{new Date(selectedPlant.plantingDate).toLocaleDateString()}</p>
                          </div>
                          <div className="bg-slate-50 px-4 py-2 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{language === 'hi' ? 'आयु' : 'Age'}</p>
                            <p className="font-bold text-slate-700">
                              {Math.floor((new Date().getTime() - new Date(selectedPlant.plantingDate).getTime()) / (1000 * 60 * 60 * 24))} {language === 'hi' ? 'दिन' : 'days'}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Info size={20} className="text-brand-600" /> {t.notes}
                          </h3>
                          <div className="bg-slate-50 p-6 rounded-3xl min-h-[120px] text-slate-600 leading-relaxed italic">
                            {selectedPlant.notes || (language === 'hi' ? "अभी तक कोई नोट्स नहीं जोड़े गए हैं। इस पौधे के इतिहास या विशिष्ट आवश्यकताओं के बारे में कुछ विवरण जोड़ने के लिए संपादन आइकन पर टैप करें।" : "No notes added yet. Tap the edit icon to add some details about this plant's history or specific needs.")}
                          </div>
                        </div>

                        <div className="pt-6 border-t border-slate-100">
                          <button 
                            onClick={() => {
                              handleSendMessage(`Tell me more about how to care for my ${selectedPlant.name} (${selectedPlant.scientificName}).`);
                            }}
                            className="w-full py-4 bg-brand-900 text-white rounded-2xl font-bold hover:bg-brand-950 transition-all flex items-center justify-center gap-2 shadow-xl"
                          >
                            <MessageSquare size={20} /> {t.chatWithBotanist}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold text-slate-900">{t.myGarden}</h2>
                    <button 
                      onClick={() => setShowAddPlant(true)}
                      className="bg-brand-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-brand-700 transition-all"
                    >
                      <Plus size={20} /> {t.addPlant}
                    </button>
                  </div>

                  {garden.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                      <Sprout size={48} className="mx-auto text-slate-300 mb-4" />
                      <h3 className="text-xl font-bold text-slate-400">{t.noPlants}</h3>
                      <p className="text-slate-400 mt-2">{t.addYourFirst}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {garden.map((plant) => (
                        <motion.div 
                          layout
                          key={plant.id}
                          onClick={() => setSelectedPlant(plant)}
                          className="bg-white rounded-3xl border border-brand-100 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:border-brand-300 transition-all group"
                        >
                          {plant.image ? (
                            <img src={plant.image} alt={plant.name} className="h-48 w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="h-48 bg-brand-50 flex items-center justify-center text-brand-200"><ImageIcon size={48} /></div>
                          )}
                          <div className="p-5 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-bold text-lg text-slate-900 truncate">{plant.name}</h3>
                                <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar size={12} /> {new Date(plant.plantingDate).toLocaleDateString()}</p>
                              </div>
                              <div className={cn(
                                "w-3 h-3 rounded-full",
                                plant.status === 'healthy' ? "bg-green-500" : 
                                plant.status === 'recovering' ? "bg-amber-500" : "bg-red-500"
                              )} />
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                              <div className="flex -space-x-2">
                                {[Droplets, Sprout, Bug].map((Icon, i) => (
                                  <div key={i} className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-400">
                                    <Icon size={14} />
                                  </div>
                                ))}
                              </div>
                              <span className="text-xs font-bold text-brand-600">View Details</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* DIAGNOSIS TAB */}
          {activeTab === 'diagnosis' && (
            <motion.div 
              key="diagnosis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!diagnosisImage ? (
                <div className="h-[calc(100vh-12rem)] flex flex-col items-center justify-center">
                  <div className="text-center mb-8 max-w-lg">
                    <h2 className="text-4xl font-bold text-slate-900 mb-4">{t.diagnoseTitle}</h2>
                    <p className="text-lg text-slate-600">{t.diagnoseDesc}</p>
                  </div>
                  <div 
                    onClick={() => diagnosisInputRef.current?.click()}
                    className="w-full max-w-md aspect-square bg-white border-2 border-dashed border-red-200 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-red-400 hover:bg-red-50 transition-all group"
                  >
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform">
                      <Bug size={40} />
                    </div>
                    <p className="font-semibold text-slate-900">{t.uploadPhoto}</p>
                    <input type="file" ref={diagnosisInputRef} onChange={(e) => handleImageUpload(e, 'diagnosis')} accept="image/*" className="hidden" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-5">
                    <div className="sticky top-24 space-y-4">
                      <div className="relative rounded-3xl overflow-hidden shadow-xl aspect-square bg-white">
                        <img src={diagnosisImage} alt="Symptom" className="w-full h-full object-cover" />
                        {isDiagnosing && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                            <Loader2 size={48} className="animate-spin mb-4" />
                            <p className="text-xl font-medium">Diagnosing...</p>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => setDiagnosisImage(null)}
                        className="w-full py-3 rounded-2xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-all"
                      >
                        {t.startOver}
                      </button>
                    </div>
                  </div>
                  <div className="lg:col-span-7 space-y-6">
                    {diagnosisResult ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <div className="bg-white p-6 rounded-3xl border border-red-100 shadow-sm">
                          <div className="flex items-center gap-2 text-red-600 mb-2">
                            <AlertCircle size={24} />
                            <h3 className="text-2xl font-bold">{diagnosisResult.issue}</h3>
                          </div>
                          <span className="inline-block px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-bold uppercase mb-4">
                            {diagnosisResult.type} Detected
                          </span>
                          <p className="text-slate-600">{diagnosisResult.description}</p>
                        </div>

                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                          <h4 className="font-bold text-slate-900 mb-3">Common Symptoms</h4>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {diagnosisResult.symptoms.map((s, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                                <div className="w-1.5 h-1.5 bg-red-400 rounded-full" /> {s}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
                            <h4 className="text-green-800 font-bold text-lg mb-2 flex items-center gap-2">
                              <Leaf size={20} /> {language === 'hi' ? 'जैविक उपचार' : 'Organic Treatment'}
                            </h4>
                            <p className="font-bold text-green-700 mb-2">{diagnosisResult.organicTreatment.method}</p>
                            <div className="markdown-body text-sm text-green-800/80 leading-relaxed">
                              <ReactMarkdown>{diagnosisResult.organicTreatment.instructions}</ReactMarkdown>
                            </div>
                          </div>
                          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                            <h4 className="text-blue-800 font-bold text-lg mb-2 flex items-center gap-2">
                              <AlertCircle size={20} /> {language === 'hi' ? 'रासायनिक उपचार' : 'Chemical Treatment'}
                            </h4>
                            <p className="font-bold text-blue-700 mb-2">{diagnosisResult.chemicalTreatment.method}</p>
                            <div className="markdown-body text-sm text-blue-800/80 leading-relaxed">
                              <ReactMarkdown>{diagnosisResult.chemicalTreatment.instructions}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : diagnosisError ? (
                      <div className="bg-red-50 p-8 rounded-3xl text-center border border-red-100">
                        <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
                        <h3 className="text-xl font-bold text-red-900">{language === 'hi' ? 'निदान विफल' : 'Diagnosis Failed'}</h3>
                        <p className="text-red-700 mt-2">{diagnosisError}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          {/* DESIGN TAB */}
          {activeTab === 'design' && (
            <motion.div 
              key="design"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {!spaceImage ? (
                <div className="h-[calc(100vh-12rem)] flex flex-col items-center justify-center">
                  <div className="text-center mb-8 max-w-lg px-4">
                    <h2 className="text-4xl font-bold text-slate-900 mb-4">{t.designTitle}</h2>
                    <p className="text-lg text-slate-600">{t.designDesc}</p>
                  </div>
                  <div 
                    onClick={() => spaceInputRef.current?.click()}
                    className="w-full max-w-md aspect-square bg-white border-2 border-dashed border-purple-200 rounded-[3rem] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all group mx-4"
                  >
                    <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                      <Sparkles size={40} />
                    </div>
                    <p className="font-semibold text-slate-900">{t.uploadSpace}</p>
                    <input 
                      type="file" 
                      ref={spaceInputRef} 
                      onChange={(e) => handleImageUpload(e, 'design')} 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-7 space-y-6">
            <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl bg-white aspect-video group">
                      <img src={designResult?.generatedImage || spaceImage} alt="Space" className="w-full h-full object-cover" />
                      {designResult && (
                        <button 
                          onClick={() => setShowFullImage(designResult.generatedImage)}
                          className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                          <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-slate-900 font-bold shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all">
                            <ImageIcon size={18} />
                            {t.viewFullImage}
                          </div>
                        </button>
                      )}
                      {isDesigning && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white p-6 text-center">
                          <Loader2 size={48} className="animate-spin mb-4" />
                          <p className="text-xl font-medium mb-2">{t.designing}</p>
                          <p className="text-sm text-white/60">{language === 'hi' ? 'इसमें लगभग 30-60 सेकंड लगते हैं क्योंकि हम प्रकाश व्यवस्था का विश्लेषण करते हैं और यथार्थवादी पौधे तैयार करते हैं।' : 'This takes about 30-60 seconds as we analyze lighting and generate realistic plants.'}</p>
                        </div>
                      )}
                      {designResult && (
                        <div className="absolute top-4 left-4 bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                          {t.aiDesigned}
                        </div>
                      )}
                    </div>
                    
                    {designResult && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-sm">
                          <h4 className="text-sm font-bold text-slate-400 uppercase mb-4">{t.environmentAnalysis}</h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-600">{t.lighting}</span>
                              <span className="font-bold text-purple-600 capitalize">{designResult.analysis.lighting}</span>
                            </div>
                            {designResult.analysis.lightingReason && (
                              <p className="text-xs text-slate-400 italic mt-1 leading-relaxed">
                                {designResult.analysis.lightingReason}
                              </p>
                            )}
                            <div className="flex justify-between items-center">
                              <span className="text-slate-600">{t.spaceType}</span>
                              <span className="font-bold text-purple-600 capitalize">{designResult.analysis.type}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-purple-900 text-white p-6 rounded-3xl shadow-lg">
                          <h4 className="text-sm font-bold text-purple-300 uppercase mb-4">{t.aiRecommendations}</h4>
                          <ul className="space-y-2">
                            {designResult.analysis.suggestedPlants.map((plant, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                <CheckCircle2 size={14} className="text-purple-400" /> {plant}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {designError && (
                      <div className="bg-red-50 p-6 rounded-3xl border border-red-100 flex items-center gap-4 text-red-700">
                        <AlertCircle size={24} />
                        <p className="font-medium">{designError}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
                      <h3 className="text-xl font-bold mb-4">{t.designControls}</h3>
                      <div className="space-y-4">
                        <button 
                          onClick={() => {
                            setSpaceImage(null);
                            setDesignResult(null);
                            setDesignError(null);
                            setSpaceAspectRatio("1:1");
                          }}
                          className="w-full py-3 rounded-2xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={18} /> {t.startOver}
                        </button>
                        {designResult && (
                          <button 
                            onClick={() => {
                              // Logic to add all suggested plants to garden could go here
                              const firstPlant = designResult.analysis.suggestedPlants[0];
                              setPlantInfo({
                                name: firstPlant,
                                scientificName: 'AI Suggested',
                                description: `A plant suggested for your ${designResult.analysis.type} space.`,
                                care: { watering: 'Moderate', sunlight: designResult.analysis.lighting, temperature: 'Room temp', soil: 'Well-draining' },
                                tips: ['Place in the spot identified by AI', 'Monitor soil moisture']
                              });
                              setActiveTab('identify');
                            }}
                            className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                          >
                            <Plus size={20} /> Add Suggested Plants
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-slate-100 p-6 rounded-3xl">
                      <h4 className="font-bold text-slate-900 mb-2">How it works</h4>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Our AI analyzes your photo to detect light sources and available space. It then selects plants that will thrive in those specific conditions and visually places them in your room using generative imaging.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 flex justify-between items-center z-50">
        {[
          { id: 'home', icon: <Home size={24} />, label: t.home },
          { id: 'garden', icon: <LayoutDashboard size={24} />, label: t.gardenTab },
          { id: 'identify', icon: <Camera size={24} />, label: t.identifyTab },
          { id: 'design', icon: <Sparkles size={24} />, label: t.designTab },
          { id: 'diagnosis', icon: <Bug size={24} />, label: t.diagnoseTab },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as Tab); setSelectedPlant(null); }}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === tab.id ? "text-brand-600" : "text-slate-400"
            )}
          >
            {tab.icon}
            <span className="text-[10px] font-bold uppercase">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Add Plant Modal */}
      {showAddPlant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold">Add New Plant</h3>
              <button onClick={() => setShowAddPlant(false)}><X size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Plant Name</label>
                <input 
                  type="text" 
                  value={newPlant.name} 
                  onChange={e => setNewPlant({...newPlant, name: e.target.value})}
                  className="w-full bg-slate-50 border rounded-xl p-3 focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Monstera Deliciosa"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Notes (Optional)</label>
                <textarea 
                  value={newPlant.notes} 
                  onChange={e => setNewPlant({...newPlant, notes: e.target.value})}
                  className="w-full bg-slate-50 border rounded-xl p-3 focus:ring-2 focus:ring-brand-500 h-20 resize-none"
                  placeholder="e.g. Gift from Sarah, keep away from cats"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Planting Date</label>
                <input 
                  type="date" 
                  value={newPlant.plantingDate} 
                  onChange={e => setNewPlant({...newPlant, plantingDate: e.target.value})}
                  className="w-full bg-slate-50 border rounded-xl p-3 focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Water (Days)</label>
                  <input 
                    type="number" 
                    value={newPlant.reminders?.watering} 
                    onChange={e => setNewPlant({...newPlant, reminders: {...newPlant.reminders!, watering: parseInt(e.target.value)}})}
                    className="w-full bg-slate-50 border rounded-xl p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fertilize (Days)</label>
                  <input 
                    type="number" 
                    value={newPlant.reminders?.fertilizing} 
                    onChange={e => setNewPlant({...newPlant, reminders: {...newPlant.reminders!, fertilizing: parseInt(e.target.value)}})}
                    className="w-full bg-slate-50 border rounded-xl p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pest (Days)</label>
                  <input 
                    type="number" 
                    value={newPlant.reminders?.pestControl} 
                    onChange={e => setNewPlant({...newPlant, reminders: {...newPlant.reminders!, pestControl: parseInt(e.target.value)}})}
                    className="w-full bg-slate-50 border rounded-xl p-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 flex gap-3">
              <button onClick={() => setShowAddPlant(false)} className="flex-1 py-3 font-bold text-slate-500">{t.cancel}</button>
              <button 
                onClick={async () => {
                  if (newPlant.name && user) {
                    const plantId = crypto.randomUUID();
                    const plant: GardenPlant = { 
                      ...newPlant as GardenPlant, 
                      id: plantId, 
                      uid: user.uid 
                    };
                    try {
                      await setDoc(doc(db, 'plants', plantId), plant);
                      setShowAddPlant(false);
                      setNewPlant({ name: '', plantingDate: new Date().toISOString().split('T')[0], reminders: { watering: 3, fertilizing: 30, pestControl: 60 } });
                    } catch (error) {
                      handleFirestoreError(error, OperationType.CREATE, 'plants');
                    }
                  } else if (!user) {
                    handleSignIn();
                  }
                }}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl font-bold shadow-lg shadow-brand-200"
              >
                {t.addPlant}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Full Image Modal */}
      {showFullImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 md:p-12">
          <button 
            onClick={() => setShowFullImage(null)}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
          >
            <X size={32} />
          </button>
          <img 
            src={showFullImage} 
            alt="Full Design" 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" 
          />
        </div>
      )}

      {/* Persistent BOTanist Chat */}
      <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-[60]">
        <AnimatePresence>
          {showChat && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-16 right-0 w-[320px] md:w-[400px] h-[500px] bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
            >
              <div className="p-4 bg-brand-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center">
                    <Sprout size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-none">BOTanist</p>
                    <p className="text-[10px] text-brand-300">Expert AI Assistant</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={isLiveActive ? stopLiveSession : startLiveSession}
                    className={cn(
                      "p-1.5 rounded-full transition-all",
                      isLiveActive ? "bg-red-500 text-white animate-pulse" : "bg-white/10 hover:bg-white/20 text-white"
                    )}
                  >
                    {isLiveActive ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                  <button onClick={() => setShowChat(false)} className="text-white/50 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <MessageSquare size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium">Hi! I'm BOTanist. Ask me anything about your plants or space design!</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={cn(
                    "max-w-[85%] p-3 rounded-2xl text-sm relative group shadow-sm",
                    msg.role === 'user' ? "bg-brand-600 text-white ml-auto rounded-tr-none" : "bg-white text-slate-800 mr-auto rounded-tl-none border border-slate-100"
                  )}>
                    <div className={cn("markdown-body prose-sm", msg.role === 'user' && "prose-invert")}>
                      {msg.text ? <ReactMarkdown>{msg.text}</ReactMarkdown> : (
                        <div className="flex gap-1 py-2">
                          <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" />
                          <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      )}
                    </div>
                    {msg.role === 'model' && (
                      <button 
                        onClick={() => speakText(msg.text, i)}
                        className={cn(
                          "absolute -right-8 top-1/2 -translate-y-1/2 transition-opacity",
                          playingMessageIndex === i ? "opacity-100 text-brand-600" : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand-600"
                        )}
                      >
                        {playingMessageIndex === i ? <Square size={16} fill="currentColor" /> : <Volume2 size={16} />}
                      </button>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 bg-white border-t">
                <div className="relative">
                  <input 
                    type="text" 
                    value={userInput} 
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ask BOTanist..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-brand-500 transition-all outline-none"
                  />
                  <button 
                    onClick={() => handleSendMessage()} 
                    disabled={isChatting || !userInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-brand-600 text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700 transition-all"
                  >
                    {isChatting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setShowChat(!showChat)}
          className={cn(
            "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95",
            showChat ? "bg-slate-900 text-white rotate-90" : "bg-brand-600 text-white"
          )}
        >
          {showChat ? <X size={24} /> : <MessageSquare size={24} />}
          {!showChat && chatHistory.length > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              !
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
