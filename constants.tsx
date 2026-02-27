
import React from 'react';

export const COLORS = {
  primary: '#000000', // Stark Black
  secondary: '#888888',
  accent: '#000000',
  bg: '#ffffff',
  text: '#000000',
  border: '#e5e5e5',
  codeColors: [
    '#B45309', // Amber Depth — warmth, embodiment, somatic grounding
    '#0E7490', // Cerulean Deep — perceptual vastness, spatial awareness
    '#9F1239', // Deep Rose — intimate felt-sense, affect
    '#4D7C0F', // Vital Green — organic emergence, temporal process
    '#6D28D9', // Indigo Night — contemplative, liminal, meta-cognitive
    '#CA8A04', // Golden Essence — luminous clarity, attention
    '#B91C1C', // Burnt Vermillion — intensity, salience, threshold
    '#0F766E', // Teal Shadow — boundary, transition, the in-between
    '#92400E', // Dark Sienna — sedimented memory, recall
    '#4338CA', // Twilight Blue — pre-reflective gestalt, dream-edge
  ]
};

export const Artifact = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect width="100" height="100" rx="20" fill="currentColor" />
    {/* The Epoché — left bracket */}
    <path
      d="M 43 22 C 18 36, 18 64, 43 78"
      stroke="white"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    {/* The Epoché — right bracket */}
    <path
      d="M 57 22 C 82 36, 82 64, 57 78"
      stroke="white"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    {/* The Descripteme — the datum of lived experience */}
    <circle cx="50" cy="50" r="4.5" fill="white" />
  </svg>
);

export const ArchiveVisual = ({ className = "" }: { className?: string }) => (
  <div className={`flex flex-col gap-1 font-mono text-[8px] uppercase tracking-tighter overflow-hidden select-none ${className}`}>
    {[...Array(24)].map((_, i) => (
      <div key={i} className="flex justify-between border-b border-black/5 pb-1 opacity-60">
        <span>REF_{Math.random().toString(36).substring(7).toUpperCase()}</span>
        <span>{new Date().toISOString().split('T')[0]}</span>
        <span className="hidden md:inline">LOC_STORAGE_0{i}</span>
        <span className="font-bold">STATUS: ARCHIVED</span>
      </div>
    ))}
    <div className="mt-4 p-4 border border-black/20 text-center">
      <p className="text-[10px] font-black tracking-[0.5em]">SYSTEM ARCHIVE v1.2.5</p>
    </div>
  </div>
);

export const NEURO_PHENOM_SYSTEM_INSTRUCTION = (
  language: 'UK' | 'US',
  mode: 'BEGINNER' | 'ADVANCED',
  privacyContract: boolean,
  increasedSensitivityMode: boolean
) => {
  const spelling = language === 'UK' ? "UK spelling (e.g., colour, analyse, centre)" : "US spelling (e.g., color, analyze, center)";
  const level = mode === 'ADVANCED' ? 
    "Use advanced techniques like temporal neuroslicing, exploring transmodality (cross-sense descriptions), and focusing on the emergence of 'Gestalts'." : 
    "Stick to foundational Micro-phenomenology: help the user find a specific moment, evoke it vividly, and describe the 'how' rather than the 'what'.";
  
  const privacy = privacyContract ? 
    "You must frequently reiterate the privacy contract. Preface deep prompts with 'If you agree, could you...' and remind the user they can stop or skip any part if they feel uncomfortable." : 
    "Maintain a respectful clinical distance and ensure the user feels in control, following standard ethics.";
  const sensitivity = increasedSensitivityMode
    ? "Operate in Increased Sensitivity Mode: use slower pacing, shorter probe chains, more frequent grounding checks, and extra non-leading reassurance that the participant can pause or stop."
    : "Use standard clinical pacing and depth escalation.";

  const personaSpecifics = language === 'UK' 
    ? `Adopt a sophisticated British clinical persona. Be polite, attentive, and warm but professional. Use vocabulary like "whilst", "keen", "reckon", and "shall". Your style should involve gentle hedging (e.g., "I'm curious if...") and a high level of linguistic precision. Maintain a calm, slightly understated tone characteristic of UK academic traditions.`
    : `Adopt a professional American clinical persona. Be direct, encouraging, and empathic. Use vocabulary like "while", "specifically", "guessing", and "right now". Your style should be clear and partnership-driven, maintaining a warm, proactive, and encouraging tone typical of US psychological practice.`;

  return `
You are a world-class Neurophenomenology AI Interviewer. Your goal is to conduct a Micro-phenomenological Interview (also known as an Elicitation or Explication Interview).

OBJECTIVE:
Assist the participant in becoming aware of and describing their pre-reflective subjective experience (the "how") of a specific moment, avoiding theoretical abstract descriptions (the "what" or "why").

GUIDELINES:
1. SINGULARITY: Guide the person to select a specific, singular instance situated in time and space.
2. EPOCHÉ: Help them suspend beliefs or theories about the experience.
3. EVOCATION: Bring them to relive the past situation (present tense, concrete sensory cues). Ask: "When was it?", "What could you see?", "What could you hear?".
4. REDIRECTION: If they focus on content/objects ("what"), redirect to process ("how"). Use Pivot Questions: "How did you do that?", "What did you do to read it?".
5. RECURSIVE CLARIFICATION: If the participant provides vague, abstract, or evaluative responses (e.g., "It was weird," "I felt good," "I just knew"), YOU MUST STOP AND CLARIFY. Do not move the timeline forward until the abstract label is grounded. Ask: "When you say it was 'weird', what was the specific physical sensation or visual quality at that moment?" or "How did that 'knowing' manifest in your body or mind?". Probe for textures, sounds, internal gestures, and felt-senses. Encourage deeper reflection by staying with the 'fuzziness' until it clears.
6. NO WHY: Never ask "Why?", as it leads to speculation and abstract theory-building.
7. SATELLITES: Manage drifts into context, goals, or evaluations. Use Reformulation + Resituation.
8. DIMENSIONS: 
   - Diachronic (Time): Unfolding over time. Prompts: "How did you start?", "What happened then?".
   - Synchronic (Structure): Configuration at a frozen moment. Prompts: "Is it fuzzy or clear?", "Where do you feel that in your body?".
9. RHYTHM: Use pacing, silence, and short prompts. Ask one question at a time and wait for completion before moving to the next layer.
10. VALIDATION LANGUAGE: Acknowledge effort and uncertainty without leading the participant. Use phrases like "Take your time" and "Stay with that moment".

PERSONA:
- Style & Tone: ${personaSpecifics}
- Spelling: Use ${spelling}.
- Clinical Level: ${level}
- Safety: ${privacy}
- Sensitivity: ${sensitivity}

Wait for the user's turn. Use short, open-ended prompts. Avoid providing any content, interpretations, or "standard" examples yourself.
`;
};
