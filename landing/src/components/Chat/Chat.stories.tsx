import type { Meta, StoryObj } from '@storybook/react';
import ChatMessage from './ChatMessage';
import MarkdownView from './MarkdownView';
import GrundingBadge from './GrundingBadge';

/* ChatMessage Stories */
const ChatMessageMeta = {
  title: 'Chat/ChatMessage',
  component: ChatMessage,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    role: {
      control: 'radio',
      options: ['user', 'assistant'],
    },
    groundingState: {
      control: 'radio',
      options: ['grounded', 'partial', 'refusal'],
    },
  },
} satisfies Meta<typeof ChatMessage>;

export default ChatMessageMeta;
type ChatMessageStory = StoryObj<typeof ChatMessageMeta>;

export const UserMessage: ChatMessageStory = {
  args: {
    id: '1',
    role: 'user',
    content: 'What is the stall speed for a Cessna 172?',
    timestamp: new Date(),
  },
};

export const AssistantMessageGrounded: ChatMessageStory = {
  args: {
    id: '2',
    role: 'assistant',
    content:
      'The stall speed varies with weight and configuration. Per **§91.307 (Performance Operating Limitations)**, you must reference your aircraft POH. For a standard Cessna 172, it\'s approximately 35 knots in cruise configuration.',
    citations: ['91.307'],
    groundingState: 'grounded',
    groundingSection: '91.307',
    timestamp: new Date(),
  },
};

export const AssistantMessageStreaming: ChatMessageStory = {
  args: {
    id: '3',
    role: 'assistant',
    content: 'Let me check the regulations for you...',
    isStreaming: true,
    timestamp: new Date(),
  },
};

export const AssistantMessagePartial: ChatMessageStory = {
  args: {
    id: '4',
    role: 'assistant',
    content:
      'This touches on several GACAR sections. The primary regulatory framework is in **§91 (General Operating and Flight Rules)**, though specific performance data comes from your aircraft manual.',
    groundingState: 'partial',
    groundingSection: '91',
    timestamp: new Date(),
  },
};

export const AssistantMessageRefusal: ChatMessageStory = {
  args: {
    id: '5',
    role: 'assistant',
    content:
      'I cannot provide specific procedural guidance for your aircraft without seeing your operations manual. Always refer to your POH for performance data.',
    groundingState: 'refusal',
    timestamp: new Date(),
  },
};

/* MarkdownView Stories */
const MarkdownViewMeta = {
  title: 'Chat/MarkdownView',
  component: MarkdownView,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof MarkdownView>;

export const MarkdownBasic: StoryObj<typeof MarkdownViewMeta> = {
  args: {
    markdown: `**Bold text** and *italic text* and __underlined text__.

Here is a [link to GACA](https://gaca.gov.sa).

- Item one
- Item two
- Item three

1. First step
2. Second step
3. Third step`,
    showCitations: true,
  },
};

export const MarkdownWithCitations: StoryObj<typeof MarkdownViewMeta> = {
  args: {
    markdown: `Per §91.155 (VFR Minimums), you must maintain visual contact with terrain.

The requirements per §91.155 are:
- Visibility ≥ 3 statute miles
- Cloud clearance as defined in §91.155(c)

Always reference the current GACAR at gaca.gov.sa.`,
    showCitations: true,
  },
};

/* GrundingBadge Stories */
const GrundingBadgeMeta = {
  title: 'Chat/GrundingBadge',
  component: GrundingBadge,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    state: {
      control: 'radio',
      options: ['grounded', 'partial', 'refusal'],
    },
  },
} satisfies Meta<typeof GrundingBadge>;

export const BadgeGrounded: StoryObj<typeof GrundingBadgeMeta> = {
  args: {
    state: 'grounded',
    section: '91.155',
  },
};

export const BadgePartial: StoryObj<typeof GrundingBadgeMeta> = {
  args: {
    state: 'partial',
    section: '91.307',
  },
};

export const BadgeRefusal: StoryObj<typeof GrundingBadgeMeta> = {
  args: {
    state: 'refusal',
  },
};

export const BadgeGroundedNoSection: StoryObj<typeof GrundingBadgeMeta> = {
  args: {
    state: 'grounded',
  },
};
