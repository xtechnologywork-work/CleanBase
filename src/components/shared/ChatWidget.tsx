import React, { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

export const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ text: string, sender: 'bot' | 'user' }[]>([
        { text: 'Hi! I am CleanBot 🤖. How can I help you today?', sender: 'bot' }
    ]);
    const [input, setInput] = useState('');

    const handleSend = () => {
        if (!input.trim()) return;

        const newMsg = input.trim();
        setMessages(prev => [...prev, { text: newMsg, sender: 'user' }]);
        setInput('');

        setTimeout(() => {
            let botReply = "I can help with that. Are you looking to book a new service or check an existing one?";
            if (newMsg.toLowerCase().includes('book')) botReply = "Great! You can book instantly by logging into your portal or clicking 'Book Now' on our site.";
            if (newMsg.toLowerCase().includes('price')) botReply = "Our standard deep clean starts at $120. A full list of our services is available on the pricing page.";

            setMessages(prev => [...prev, { text: botReply, sender: 'bot' }]);
        }, 1000);
    };

    return (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 999 }}>
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="btn btn-primary shadow-lg animate-fade-in"
                    style={{ width: '60px', height: '60px', borderRadius: '50%', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <MessageSquare size={28} />
                </button>
            )}

            {isOpen && (
                <div className="card animate-fade-in" style={{ width: '350px', height: '500px', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)', border: 'none', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: 'var(--color-primary)', color: 'white', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, color: 'white', fontSize: '1.125rem' }}>AI Assistant</h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.9 }}>Typically replies instantly</p>
                        </div>
                        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ flex: 1, padding: '1rem', backgroundColor: 'var(--color-bg-subtle)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {messages.map((m, idx) => (
                            <div key={idx} style={{ alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '1.25rem',
                                    borderBottomRightRadius: m.sender === 'user' ? '0' : '1.25rem',
                                    borderBottomLeftRadius: m.sender === 'bot' ? '0' : '1.25rem',
                                    backgroundColor: m.sender === 'user' ? 'var(--color-primary)' : 'white',
                                    color: m.sender === 'user' ? 'white' : 'var(--color-text-primary)',
                                    boxShadow: 'var(--shadow-sm)',
                                    fontSize: '0.875rem'
                                }}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)', backgroundColor: 'white', display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            className="input-field"
                            style={{ flex: 1, margin: 0, padding: '0.75rem', borderRadius: '2rem' }}
                            placeholder="Type your message..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <button
                            onClick={handleSend}
                            className="btn btn-primary"
                            style={{ width: '40px', height: '40px', padding: '0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Send size={18} style={{ marginLeft: '-2px' }} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
