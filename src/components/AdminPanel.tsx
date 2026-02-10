import { useState } from 'react';
import { FiUpload, FiTrash2, FiShield, FiUsers, FiFile, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import {
  useAllSharedAgentDocs,
  useAddSharedAgentDoc,
  useRemoveSharedAgentDoc,
  useAllUsers,
  useSetUserRole,
  useGenerateUploadUrl,
} from '../hooks/useConvexData';

const AGENT_TYPES = [
  { id: 'faa-inspector', name: 'FAA Inspector', color: 'text-blue-400' },
  { id: 'shop-owner', name: 'Shop Owner', color: 'text-green-400' },
  { id: 'isbao-auditor', name: 'IS-BAO Auditor', color: 'text-purple-400' },
  { id: 'easa-inspector', name: 'EASA Inspector', color: 'text-amber-400' },
  { id: 'as9100-auditor', name: 'AS9100 Auditor', color: 'text-red-400' },
  { id: 'sms-consultant', name: 'SMS Consultant', color: 'text-teal-400' },
  { id: 'safety-auditor', name: 'Safety Auditor', color: 'text-orange-400' },
] as const;

export default function AdminPanel() {
  const allDocs = useAllSharedAgentDocs() as any[] | undefined;
  const addDoc = useAddSharedAgentDoc();
  const removeDoc = useRemoveSharedAgentDoc();
  const allUsers = useAllUsers() as any[] | undefined;
  const setRole = useSetUserRole();
  const generateUploadUrl = useGenerateUploadUrl();

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [tab, setTab] = useState<'kb' | 'users'>('kb');

  const docsByAgent = (agentId: string) =>
    (allDocs || []).filter((d: any) => d.agentId === agentId);

  const handleFileUpload = async (agentId: string, files: FileList) => {
    setUploading(agentId);
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();
    try {
      for (const file of Array.from(files)) {
        // Extract text from the file
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type);
        } catch {
          // If extraction fails, store without text
        }

        // Upload binary to Convex storage
        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          const { storageId: sid } = await result.json();
          storageId = sid;
        } catch {
          // Storage upload optional — text is the important part
        }

        await addDoc({
          agentId,
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          extractedText: extractedText || undefined,
          storageId,
        });
      }
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FiShield className="text-3xl text-sky-light" />
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Admin Panel</h1>
          <p className="text-white/50 text-sm">Manage shared knowledge bases and user roles</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('kb')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'kb' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiFile className="inline mr-2" />
          Knowledge Bases
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'users' ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FiUsers className="inline mr-2" />
          Users
        </button>
      </div>

      {/* Knowledge Base Management */}
      {tab === 'kb' && (
        <div className="space-y-3">
          {AGENT_TYPES.map((agent) => {
            const docs = docsByAgent(agent.id);
            const isExpanded = expandedAgent === agent.id;
            const isUploading = uploading === agent.id;

            return (
              <div key={agent.id} className="glass rounded-xl border border-white/10">
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <FiChevronDown className="text-white/40" /> : <FiChevronRight className="text-white/40" />}
                    <span className={`font-medium ${agent.color}`}>{agent.name}</span>
                    <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                      {docs.length} doc{docs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-3">
                    {/* Upload button */}
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors mb-3 ${
                      isUploading ? 'bg-white/5 text-white/40' : 'bg-sky/10 text-sky-lighter hover:bg-sky/20'
                    }`}>
                      <FiUpload />
                      {isUploading ? 'Uploading...' : 'Upload Documents'}
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.txt,.csv,.xlsx"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          if (e.target.files?.length) {
                            handleFileUpload(agent.id, e.target.files);
                          }
                        }}
                      />
                    </label>

                    {/* Document list */}
                    {docs.length === 0 ? (
                      <p className="text-sm text-white/30 italic">No shared documents for this agent yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {docs.map((doc: any) => (
                          <div key={doc._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5">
                            <div className="flex items-center gap-2 min-w-0">
                              <FiFile className="text-white/40 flex-shrink-0" />
                              <span className="text-sm text-white/80 truncate">{doc.name}</span>
                              <span className="text-xs text-white/30">
                                {doc.extractedText ? `${Math.round(doc.extractedText.length / 1000)}k chars` : 'no text'}
                              </span>
                            </div>
                            <button
                              onClick={() => removeDoc({ documentId: doc._id })}
                              className="text-red-400/60 hover:text-red-400 transition-colors flex-shrink-0"
                              title="Remove document"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* User Management */}
      {tab === 'users' && (
        <div className="glass rounded-xl border border-white/10">
          {!allUsers ? (
            <div className="p-8 text-center text-white/40">Loading users...</div>
          ) : allUsers.length === 0 ? (
            <div className="p-8 text-center text-white/40">No users found.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {allUsers.map((u: any) => (
                <div key={u._id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    {u.picture ? (
                      <img src={u.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium">
                        {(u.name || u.email)[0]}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">{u.name || u.email}</div>
                      <div className="text-xs text-white/40">{u.email}</div>
                    </div>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => setRole({ targetUserId: u._id, role: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-sky-light/50"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
