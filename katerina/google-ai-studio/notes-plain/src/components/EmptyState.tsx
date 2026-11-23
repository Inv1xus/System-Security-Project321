import React from 'react';
import { 
  FilePlus, 
  CheckSquare, 
  BookOpen, 
  Briefcase, 
  Lightbulb, 
  ShieldCheck 
} from 'lucide-react';

interface EmptyStateProps {
  onCreateWithTemplate: (title: string, content: string, category: string) => void;
  onCreateBlank: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  onCreateWithTemplate,
  onCreateBlank,
}) => {
  const templates = [
    {
      title: 'Daily Reflection',
      category: 'Personal',
      icon: BookOpen,
      desc: 'Log thoughts, highlights, and gratitude for the day.',
      content: `# Daily Reflection - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}\n\n### 🌟 Highlights of Today\n- \n- \n\n### 🎯 Key Accomplishments\n- \n\n### 💭 What I Learned\n- \n\n### 🙏 Gratitude\n- `,
    },
    {
      title: 'Action Item Checklist',
      category: 'Work',
      icon: CheckSquare,
      desc: 'Track tasks with interactive markdown checkboxes.',
      content: `# Tasks & Next Steps\n\n### High Priority\n- [ ] Review quarterly milestones\n- [ ] Finalize architecture proposal\n\n### Medium Priority\n- [ ] Clean up inbox\n- [ ] Sync with design team\n\n### Low Priority\n- [ ] Read technical paper\n- [ ] Update personal reading list`,
    },
    {
      title: 'Project Architecture Outline',
      category: 'Projects',
      icon: Lightbulb,
      desc: 'Map out technical architecture, tech stack, and goals.',
      content: `# Project Spec: Architecture & Goals\n\n### 🎯 Objective\nWhat problem does this project solve?\n\n### 🛠️ Architecture & Tech Stack\n- **Backend**: Node.js + Express (Port 3000)\n- **Database**: SQLite (ACID compliant, zero network latency)\n- **Frontend**: React + Tailwind CSS\n\n### 📦 Deployment\n- Containerized via Docker\n- Volume mounted for persistent database`,
    },
    {
      title: 'Meeting Notes',
      category: 'Work',
      icon: Briefcase,
      desc: 'Attendees, agenda discussion points, and follow-ups.',
      content: `# Meeting Notes: Sync\n\n**Date**: ${new Date().toLocaleDateString()}\n**Attendees**: Team\n\n### 📋 Agenda\n1. Project status\n2. Open blockers\n3. Next release\n\n### 💬 Discussion Points\n- \n\n### 📌 Action Items\n- [ ] Assign owner to deployment pipeline`,
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-stone-950 text-stone-200 overflow-y-auto">
      <div className="max-w-xl w-full text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-5 shadow-inner">
          <FilePlus className="w-8 h-8" />
        </div>

        <h2 className="text-2xl font-bold font-serif text-stone-100 tracking-tight">
          Select a note or start writing
        </h2>
        <p className="text-stone-400 text-sm mt-2 max-w-md mx-auto">
          Every note you write is encrypted in transit and stored in your private local SQLite database.
        </p>

        <div className="mt-6 flex justify-center">
          <button
            onClick={onCreateBlank}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm rounded-xl transition-all shadow-md shadow-amber-500/10 flex items-center gap-2"
          >
            <FilePlus className="w-4 h-4" />
            <span>Create Blank Note</span>
          </button>
        </div>

        <div className="mt-10 text-left">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3 px-1">
            Quick Starter Templates
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.title}
                  onClick={() => onCreateWithTemplate(t.title, t.content, t.category)}
                  className="p-4 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-500/40 hover:bg-stone-850 text-left transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold text-sm text-stone-100 group-hover:text-amber-300">
                      {t.title}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">
                    {t.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-stone-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Multi-user separation • Passwords hashed with bcrypt</span>
        </div>
      </div>
    </div>
  );
};
