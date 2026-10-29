'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Users,
  UserRound,
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Download,
  AlertTriangle,
  Plus,
  Search,
  X,
  Trash2,
  Check,
  ShieldAlert,
  Loader2,
  Copy,
  Clock,
  HardDrive,
  ExternalLink,
} from 'lucide-react';

type Participant = {
  user_id: string;
  user_type: 'teacher' | 'student';
  user_name: string;
  joined_at?: string;
};

type Conversation = {
  id: string;
  type: 'direct' | 'group';
  title: string;
  raw_title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  participant_count: number;
  participants: Participant[];
  last_message: string | null;
  last_message_sender: string | null;
  last_message_at: string | null;
  last_message_is_alert: boolean;
  message_count: number;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'teacher' | 'student';
  sender_name: string;
  message: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  is_alert: boolean;
  created_at: string;
  is_me: boolean;
};

type StudentOption = {
  id: string;
  username: string;
  full_name: string;
  class_name: string;
};

type SelectedAttachment = {
  file: File;
  name: string;
  size: number;
  type: string;
  humanSize: string;
  previewUrl?: string;
  expiryDays: 3 | 7;
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ChatView({
  onMessage,
  currentUserRole,
}: {
  onMessage: (msg: { text: string; kind: 'success' | 'error' }) => void;
  currentUserRole?: string;
}) {
  const isTeacher = currentUserRole !== 'student';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Upload Progress
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'group' | 'direct'>('all');

  // Input states
  const [inputMessage, setInputMessage] = useState('');
  const [isAlert, setIsAlert] = useState(false);
  const [attachment, setAttachment] = useState<SelectedAttachment | null>(null);

  // Modals
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);

  // Group creation states
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentList, setStudentList] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Preview Image Modal
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Copy feedback
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Tải danh sách cuộc trò chuyện
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      const data = await res.json();
      if (data?.success && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
        if (!selectedConvId && data.conversations.length > 0) {
          setSelectedConvId(data.conversations[0].id);
        }
      }
    } catch (err: any) {
      console.error('Lỗi tải cuộc trò chuyện:', err);
    } finally {
      setLoadingConvs(false);
    }
  }, [selectedConvId]);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // 2. Tải danh sách học sinh để tạo nhóm hoặc nhắn tin (dành cho giáo viên)
  const loadStudents = async () => {
    if (!isTeacher) return;
    setLoadingStudents(true);
    try {
      const res = await fetch('/api/subaccounts');
      const data = await res.json();
      if (data?.success && Array.isArray(data.accounts)) {
        setStudentList(
          data.accounts.map((a: any) => ({
            id: a.id,
            username: a.username,
            full_name: a.full_name,
            class_name: a.class_name,
          }))
        );
      }
    } catch (err) {
      console.error('Lỗi tải học sinh:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  // 3. Tải tin nhắn của cuộc trò chuyện đang chọn
  const loadMessages = useCallback(async (convId: string, silent = false) => {
    if (!convId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/messages?conversation_id=${encodeURIComponent(convId)}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err: any) {
      console.error('Lỗi tải tin nhắn:', err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
      const interval = setInterval(() => {
        loadMessages(selectedConvId, true);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedConvId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 4. Chọn file đính kèm (hỗ trợ tối đa 25GB)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_25GB = 25 * 1024 * 1024 * 1024;
    if (file.size > MAX_25GB) {
      onMessage({ text: 'Dung lượng file vượt quá giới hạn tối đa 25GB.', kind: 'error' });
      return;
    }

    let previewUrl: string | undefined = undefined;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
    }

    setAttachment({
      file,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      humanSize: formatBytes(file.size),
      previewUrl,
      expiryDays: 7, // Mặc định 7 ngày theo yêu cầu
    });

    e.target.value = '';
  };

  // 5. Quy trình tải file trực tiếp lên storage.to (Cloud R2 Edge, hỗ trợ tối đa 25GB)
  const uploadFileToStorageTo = async (
    att: SelectedAttachment
  ): Promise<{ fileUrl: string; fileName: string; fileSize: number; fileType: string }> => {
    // Bước 1: Khởi tạo phiên tải lên lấy presigned R2 upload URL
    setUploadProgress(10);
    setUploadStatusText('Đang khởi tạo phiên tải lên storage.to...');

    const initRes = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init',
        filename: att.name,
        content_type: att.type,
        size: att.size,
        expiry_days: att.expiryDays,
      }),
    });

    const initData = await initRes.json();
    if (!initRes.ok || !initData?.success || !initData?.upload_url) {
      throw new Error(initData?.error?.message || initData?.message || 'Không thể khởi tạo tải lên storage.to.');
    }

    // Bước 2: Tải dữ liệu trực tiếp từ trình duyệt lên R2 Edge (không nghẽn server)
    setUploadProgress(20);
    setUploadStatusText(`Đang tải trực tiếp lên Cloud Edge (${att.humanSize})...`);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', initData.upload_url);
      xhr.setRequestHeader('Content-Type', att.type);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.min(95, Math.max(20, Math.round(20 + (evt.loaded / evt.total) * 75)));
          setUploadProgress(percent);
          setUploadStatusText(`Đang truyền file (${formatBytes(evt.loaded)} / ${att.humanSize}) - ${percent}%...`);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Tải lên R2 thất bại với mã trạng thái ${xhr.status}.`));
        }
      };

      xhr.onerror = () => reject(new Error('Lỗi kết nối mạng trong quá trình truyền tải file.'));
      xhr.send(att.file);
    });

    // Bước 3: Xác nhận hoàn tất với storage.to để nhận URL tải về
    setUploadProgress(98);
    setUploadStatusText('Đang xác nhận với storage.to...');

    const confirmRes = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        r2_key: initData.r2_key,
        filename: att.name,
        content_type: att.type,
        size: att.size,
        expiry_days: att.expiryDays,
      }),
    });

    const confData = await confirmRes.json();
    if (!confirmRes.ok || !confData?.success || !confData?.file?.url) {
      throw new Error(confData?.error?.message || confData?.message || 'Không thể xác nhận hoàn tất file với storage.to.');
    }

    setUploadProgress(100);
    setUploadStatusText('Tải lên hoàn tất!');

    return {
      fileUrl: confData.file.url,
      fileName: confData.file.filename || att.name,
      fileSize: confData.file.size || att.size,
      fileType: att.type,
    };
  };

  // 6. Gửi tin nhắn
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConvId) return;
    if (!inputMessage.trim() && !attachment) return;

    setSending(true);
    let uploadedMeta: { fileUrl: string; fileName: string; fileSize: number; fileType: string } | null = null;

    try {
      if (attachment) {
        uploadedMeta = await uploadFileToStorageTo(attachment);
      }

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConvId,
          message: inputMessage.trim(),
          is_alert: isAlert,
          file_url: uploadedMeta?.fileUrl || undefined,
          file_name: uploadedMeta?.fileName || undefined,
          file_type: uploadedMeta?.fileType || undefined,
          file_size: uploadedMeta?.fileSize || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Không thể gửi tin nhắn.');
      }

      setInputMessage('');
      setIsAlert(false);
      setAttachment(null);
      await loadMessages(selectedConvId, true);
      await loadConversations();
    } catch (err: any) {
      onMessage({ text: err.message || 'Lỗi gửi tin nhắn.', kind: 'error' });
    } finally {
      setSending(false);
      setUploadProgress(null);
      setUploadStatusText('');
    }
  };

  // 7. Xử lý tạo nhóm (chỉ dành cho Giáo viên)
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) {
      onMessage({ text: 'Vui lòng nhập tên nhóm.', kind: 'error' });
      return;
    }
    if (selectedStudentIds.length === 0) {
      onMessage({ text: 'Vui lòng chọn ít nhất 1 học sinh tham gia nhóm.', kind: 'error' });
      return;
    }

    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          title: groupTitle.trim(),
          member_ids: selectedStudentIds,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Không thể tạo nhóm.');
      }

      setShowGroupModal(false);
      setGroupTitle('');
      setSelectedStudentIds([]);
      onMessage({ text: data.message || 'Đã tạo nhóm thành công!', kind: 'success' });
      await loadConversations();
      if (data.conversation?.id) {
        setSelectedConvId(data.conversation.id);
      }
    } catch (err: any) {
      onMessage({ text: err.message || 'Lỗi khi tạo nhóm.', kind: 'error' });
    }
  };

  // 8. Mở chat trực tiếp 1-1 với 1 học sinh (chỉ dành cho Giáo viên)
  const handleStartDirect = async (studentAccountId: string) => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          student_account_id: studentAccountId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Không thể mở cuộc trò chuyện.');
      }

      setShowDirectModal(false);
      await loadConversations();
      if (data.conversation?.id) {
        setSelectedConvId(data.conversation.id);
      }
      onMessage({ text: 'Đã mở cuộc trò chuyện.', kind: 'success' });
    } catch (err: any) {
      onMessage({ text: err.message || 'Lỗi mở cuộc trò chuyện.', kind: 'error' });
    }
  };

  // 9. Xóa cuộc trò chuyện (chỉ Giáo viên tạo mới được xóa)
  const handleDeleteConv = async (conv: Conversation) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa cuộc trò chuyện "${conv.title}" không? Toàn bộ tin nhắn và dữ liệu sẽ bị xóa.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/chat/conversations?id=${encodeURIComponent(conv.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || 'Không thể xóa.');
      }

      onMessage({ text: 'Đã xóa cuộc trò chuyện.', kind: 'success' });
      if (selectedConvId === conv.id) {
        setSelectedConvId(null);
        setMessages([]);
      }
      await loadConversations();
    } catch (err: any) {
      onMessage({ text: err.message || 'Lỗi khi xóa cuộc trò chuyện.', kind: 'error' });
    }
  };

  // Sao chép link file
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    onMessage({ text: 'Đã sao chép liên kết tải file!', kind: 'success' });
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  // Lọc danh sách hội thoại
  const filteredConversations = conversations.filter((c) => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(term);
      const matchParticipant = c.participants.some((p) => p.user_name.toLowerCase().includes(term));
      return matchTitle || matchParticipant;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* THANH THÔNG TIN TÍNH NĂNG VÀ BẢO MẬT */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200/60 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              Kênh Trao Đổi & An Toàn Xe Học Đường
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                Lưu trữ storage.to 25GB
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {isTeacher
                ? 'Giáo viên có toàn quyền tạo nhóm lớp, nhắn tin trực tiếp học sinh, gửi cảnh báo an toàn và chia sẻ tài liệu đến 25GB/file (lưu 7 ngày).'
                : 'Học sinh tham gia các nhóm trao đổi và nhắn tin trực tiếp với giáo viên phụ trách an toàn xe.'}
            </p>
          </div>
        </div>

        {/* CÁC NÚT TÁC VỤ DÀNH CHO GIÁO VIÊN */}
        {isTeacher && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                loadStudents();
                setShowGroupModal(true);
              }}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Users className="h-4 w-4" />
              <span>Tạo nhóm mới</span>
            </button>
            <button
              onClick={() => {
                loadStudents();
                setShowDirectModal(true);
              }}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <UserRound className="h-4 w-4" />
              <span>Nhắn học sinh</span>
            </button>
          </div>
        )}
      </div>

      {/* KHUNG GIAO DIỆN CHAT 2 CỘT */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-0 border rounded-3xl overflow-hidden shadow-xs bg-white min-h-[640px] max-h-[820px]">
        {/* CỘT TRÁI: DANH SÁCH CUỘC TRÒ CHUYỆN (4 CỘT) */}
        <div className="md:col-span-4 border-r flex flex-col bg-slate-50/60">
          {/* Ô TÌM KIẾM VÀ BỘ LỌC */}
          <div className="p-3.5 border-b space-y-2 bg-white">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm nhóm hoặc học sinh..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Tabs phân loại */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl text-[11px] font-semibold text-slate-600">
              <button
                onClick={() => setFilterType('all')}
                className={`flex-1 py-1 rounded-lg transition ${
                  filterType === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Tất cả ({conversations.length})
              </button>
              <button
                onClick={() => setFilterType('group')}
                className={`flex-1 py-1 rounded-lg transition ${
                  filterType === 'group' ? 'bg-white text-slate-800 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Nhóm
              </button>
              <button
                onClick={() => setFilterType('direct')}
                className={`flex-1 py-1 rounded-lg transition ${
                  filterType === 'direct' ? 'bg-white text-slate-800 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Trực tiếp
              </button>
            </div>
          </div>

          {/* DANH SÁCH CUỘC TRÒ CHUYỆN */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConvs ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-emerald-600" />
                Đang tải danh sách cuộc trò chuyện...
              </div>
            ) : filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const isGroup = conv.type === 'group';

                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left p-3.5 transition flex items-start gap-3 cursor-pointer ${
                      isSelected ? 'bg-emerald-50/70 border-r-4 border-emerald-600' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div
                      className={`h-10 w-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isGroup ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isGroup ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4 className={`font-bold text-xs truncate ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>
                          {conv.title}
                        </h4>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(conv.last_message_at).toLocaleDateString('vi-VN', {
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500 truncate flex-1">
                          {conv.last_message_is_alert ? (
                            <span className="text-amber-600 font-bold flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {conv.last_message}
                            </span>
                          ) : conv.last_message ? (
                            <span>
                              {conv.last_message_sender ? `${conv.last_message_sender}: ` : ''}
                              {conv.last_message}
                            </span>
                          ) : (
                            <span className="italic text-slate-400">Chưa có tin nhắn</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">Chưa có cuộc trò chuyện nào</p>
                {isTeacher && (
                  <p className="text-[11px] mt-1 text-slate-400">
                    Bấm <strong>Tạo nhóm mới</strong> hoặc <strong>Nhắn học sinh</strong> ở trên để bắt đầu!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: KHUNG CHAT & NỘI DUNG TIN NHẮN (8 CỘT) */}
        <div className="md:col-span-8 flex flex-col h-full bg-white">
          {selectedConv ? (
            <>
              {/* HEADER KHUNG CHAT */}
              <div className="px-5 py-3.5 border-b flex items-center justify-between bg-white shadow-xs z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center font-bold text-xs ${
                      selectedConv.type === 'group' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {selectedConv.type === 'group' ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-800 truncate">{selectedConv.title}</h3>
                    <p className="text-[11px] text-slate-500 flex items-center gap-2">
                      {selectedConv.type === 'group' ? (
                        <>
                          <span>Nhóm {selectedConv.participant_count} thành viên</span>
                          <button
                            onClick={() => setShowMembersModal(true)}
                            className="text-indigo-600 hover:underline cursor-pointer font-semibold"
                          >
                            Xem thành viên
                          </button>
                        </>
                      ) : (
                        <span>Cuộc trò chuyện trực tiếp</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* THAO TÁC HEADER (GIÁO VIÊN ĐƯỢC XÓA) */}
                {isTeacher && (
                  <button
                    onClick={() => handleDeleteConv(selectedConv)}
                    title="Xóa cuộc trò chuyện này"
                    className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* KHUNG DANH SÁCH TIN NHẮN */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/40">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2 text-emerald-600" />
                    Đang tải tin nhắn...
                  </div>
                ) : messages.length > 0 ? (
                  messages.map((msg) => {
                    const isMe = msg.is_me;
                    const isAlertMsg = msg.is_alert;
                    const isImage = msg.file_type?.startsWith('image/');

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%] ${
                          isMe ? 'ml-auto' : 'mr-auto'
                        }`}
                      >
                        {/* Tên người gửi (nếu là người khác trong nhóm) */}
                        {!isMe && (
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[11px] font-bold text-slate-700">{msg.sender_name}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                                msg.sender_type === 'teacher'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {msg.sender_type === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                            </span>
                          </div>
                        )}

                        {/* Bong bóng tin nhắn */}
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-xs shadow-xs break-words ${
                            isAlertMsg
                              ? 'bg-amber-500/10 border-2 border-amber-500/40 text-amber-950 font-medium'
                              : isMe
                              ? 'bg-emerald-600 text-white rounded-br-none'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                          }`}
                        >
                          {/* Huy hiệu cảnh báo nếu có */}
                          {isAlertMsg && (
                            <div className="flex items-center gap-1.5 text-amber-700 font-bold mb-1.5 text-[11px] pb-1 border-b border-amber-200">
                              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                              <span>CẢNH BÁO AN TOÀN TỪ GIÁO VIÊN</span>
                            </div>
                          )}

                          {/* Nội dung chữ */}
                          {msg.message && <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>}

                          {/* ĐÍNH KÈM FILE / ẢNH LƯU TRỮ TRÊN STORAGE.TO (TỐI ĐA 25GB) */}
                          {msg.file_url && (
                            <div className="mt-2.5 pt-2 border-t border-slate-200/50">
                              {/* Thumbnail xem nhanh nếu là ảnh */}
                              {isImage && (
                                <div className="mb-2 rounded-xl overflow-hidden border border-slate-200 bg-black/5 max-w-sm">
                                  <img
                                    src={msg.file_url}
                                    alt={msg.file_name || 'Ảnh đính kèm'}
                                    onClick={() => setPreviewImage(msg.file_url)}
                                    className="max-h-60 w-auto object-cover cursor-pointer hover:opacity-95 transition"
                                  />
                                </div>
                              )}

                              {/* Thẻ thông tin file tải về trực tiếp từ storage.to */}
                              <div
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl border ${
                                  isMe
                                    ? 'bg-white/10 border-white/25 text-white'
                                    : 'bg-slate-50 border-slate-200/90 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`p-2 rounded-lg shrink-0 ${
                                      isMe ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-[11px] truncate">{msg.file_name || 'Tệp đính kèm'}</p>
                                    <div className="flex items-center gap-2 text-[10px] opacity-80 mt-0.5">
                                      <span>{formatBytes(msg.file_size)}</span>
                                      <span>•</span>
                                      <span className="flex items-center gap-0.5">
                                        <Clock className="h-2.5 w-2.5" />
                                        Hạn 7 ngày (storage.to)
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Các nút tải trực tiếp về máy & sao chép liên kết */}
                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                  <a
                                    href={msg.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={msg.file_name || true}
                                    title="Tải trực tiếp về máy từ storage.to"
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-[10px] shadow-xs transition ${
                                      isMe
                                        ? 'bg-white text-emerald-800 hover:bg-emerald-50'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                  >
                                    <Download className="h-3 w-3" />
                                    <span>Tải về máy</span>
                                  </a>

                                  <button
                                    onClick={() => handleCopyLink(msg.file_url!)}
                                    title="Sao chép link tải"
                                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                                      isMe
                                        ? 'bg-white/15 hover:bg-white/25 text-white'
                                        : 'bg-slate-200/70 hover:bg-slate-300 text-slate-700'
                                    }`}
                                  >
                                    {copiedLink === msg.file_url ? (
                                      <Check className="h-3 w-3 text-emerald-300" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Thời gian */}
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {new Date(msg.created_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Chưa có tin nhắn nào trong cuộc trò chuyện này. Hãy gửi tin nhắn đầu tiên!
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* THANH SOẠN THẢO VÀ GỬI TIN NHẮN */}
              <div className="p-3 border-t bg-white space-y-2.5">
                {/* File preview nếu đang chọn */}
                {attachment && (
                  <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        {attachment.previewUrl ? (
                          <img
                            src={attachment.previewUrl}
                            alt="Preview"
                            className="h-8 w-8 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : attachment.type.startsWith('image/') ? (
                          <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        )}
                        <span className="truncate font-semibold text-slate-800">{attachment.name}</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                          {attachment.humanSize}
                        </span>
                      </div>

                      <button
                        onClick={() => setAttachment(null)}
                        disabled={sending}
                        className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 cursor-pointer disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Lựa chọn thời hạn lưu trữ storage.to */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3.5 w-3.5 text-indigo-500" />
                        Lưu trữ storage.to (tối đa 25GB):
                      </span>
                      <div className="flex items-center gap-1 font-semibold">
                        <button
                          type="button"
                          onClick={() => setAttachment({ ...attachment, expiryDays: 7 })}
                          className={`px-2 py-0.5 rounded-md transition ${
                            attachment.expiryDays === 7
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          7 ngày (Khuyên dùng)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttachment({ ...attachment, expiryDays: 3 })}
                          className={`px-2 py-0.5 rounded-md transition ${
                            attachment.expiryDays === 3
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          3 ngày
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* THANH TIẾN ĐỘ TẢI LÊN NẾU ĐANG GỬI */}
                {uploadProgress !== null && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 text-xs text-emerald-900">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                        {uploadStatusText}
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Form nhập */}
                <form onSubmit={handleSendMessage} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* Nút đính kèm ảnh/file (hỗ trợ tối đa 25GB) */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => fileInputRef.current?.click()}
                      title="Đính kèm ảnh hoặc tài liệu bất kỳ (tối đa 25GB, lưu 7 ngày)"
                      className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer disabled:opacity-50"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>

                    {/* Ô nhập nội dung */}
                    <input
                      type="text"
                      value={inputMessage}
                      disabled={sending}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Nhập nội dung tin nhắn... (nhấn Enter để gửi)"
                      className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-75"
                    />

                    {/* Nút gửi */}
                    <button
                      type="submit"
                      disabled={sending || (!inputMessage.trim() && !attachment)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span>Gửi</span>
                    </button>
                  </div>

                  {/* Tuỳ chọn Cảnh báo an toàn (chỉ Giáo viên) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500">
                    {isTeacher ? (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isAlert}
                          disabled={sending}
                          onChange={(e) => setIsAlert(e.target.checked)}
                          className="h-3.5 w-3.5 accent-amber-600 rounded"
                        />
                        <span className={`font-semibold ${isAlert ? 'text-amber-700' : 'text-slate-600'}`}>
                          🚨 Đánh dấu cảnh báo an toàn khẩn cấp
                        </span>
                      </label>
                    ) : (
                      <span className="italic text-[10px] text-slate-400">
                        Học sinh trao đổi và phản hồi an toàn với giáo viên phụ trách
                      </span>
                    )}

                    <span className="text-[10px] text-slate-400">
                      Lưu trữ Cloud storage.to (tối đa 25GB/file, hạn 3/7 ngày)
                    </span>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <div className="h-16 w-16 rounded-3xl bg-slate-100 flex items-center justify-center mb-3">
                <MessageSquare className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="font-bold text-slate-700 text-sm">Chọn một cuộc trò chuyện</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Chọn từ danh sách bên trái hoặc nhấn nút tạo nhóm / nhắn tin để bắt đầu trao đổi an toàn.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: TẠO NHÓM MỚI (DÀNH CHO GIÁO VIÊN) */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                Tạo nhóm trò chuyện học sinh mới
              </h3>
              <button onClick={() => setShowGroupModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Tên nhóm trò chuyện <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Ví dụ: Nhóm An Toàn Tuyến 1, Nhóm Lớp 10A1..."
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase text-slate-700">
                    Chọn học sinh tham gia ({selectedStudentIds.length}/{studentList.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedStudentIds.length === studentList.length) {
                        setSelectedStudentIds([]);
                      } else {
                        setSelectedStudentIds(studentList.map((s) => s.id));
                      }
                    }}
                    className="text-[11px] text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    {selectedStudentIds.length === studentList.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl p-2 divide-y divide-slate-100 bg-slate-50/50">
                  {loadingStudents ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-indigo-600" />
                      Đang tải danh sách học sinh...
                    </div>
                  ) : studentList.length > 0 ? (
                    studentList.map((st) => {
                      const isChecked = selectedStudentIds.includes(st.id);
                      return (
                        <label
                          key={st.id}
                          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white cursor-pointer transition select-none"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-xs text-slate-800">{st.full_name}</p>
                            <p className="text-[11px] text-slate-500">
                              Lớp: {st.class_name} · Tên đăng nhập: <span className="font-mono">{st.username}</span>
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedStudentIds((prev) =>
                                isChecked ? prev.filter((id) => id !== st.id) : [...prev, st.id]
                              );
                            }}
                            className="h-4 w-4 accent-indigo-600 rounded"
                          />
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Chưa có tài khoản học sinh con nào trong trường. Vui lòng tạo tài khoản con ở tab <strong>Tài khoản con</strong> trước.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!groupTitle.trim() || selectedStudentIds.length === 0}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  Tạo nhóm trò chuyện ({selectedStudentIds.length} học sinh)
                </button>
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NHẮN TIN TRỰC TIẾP 1-1 (DÀNH CHO GIÁO VIÊN) */}
      {showDirectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <UserRound className="h-5 w-5 text-emerald-600" />
                Mở cuộc trò chuyện với học sinh
              </h3>
              <button onClick={() => setShowDirectModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Chọn học sinh con trong trường để mở cuộc trò chuyện trực tiếp 1-1:
            </p>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-2xl p-2 divide-y divide-slate-100 bg-slate-50/50">
              {loadingStudents ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-emerald-600" />
                  Đang tải danh sách học sinh...
                </div>
              ) : studentList.length > 0 ? (
                studentList.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => handleStartDirect(st.id)}
                    className="w-full text-left p-3 rounded-xl hover:bg-emerald-50 transition flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-xs text-slate-800 group-hover:text-emerald-700">{st.full_name}</p>
                      <p className="text-[11px] text-slate-500">
                        Lớp: {st.class_name} · Username: <span className="font-mono text-emerald-600">{st.username}</span>
                      </p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                      Nhắn tin →
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  Chưa có tài khoản học sinh con nào trong trường.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: XEM THÀNH VIÊN NHÓM */}
      {showMembersModal && selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-base text-slate-800">
                Thành viên nhóm: {selectedConv.title} ({selectedConv.participants.length})
              </h3>
              <button onClick={() => setShowMembersModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {selectedConv.participants.map((p, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        p.user_type === 'teacher' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {p.user_type === 'teacher' ? <Users className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-800">{p.user_name}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{p.user_type === 'teacher' ? 'Giáo viên' : 'Học sinh'}</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      p.user_type === 'teacher' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {p.user_type === 'teacher' ? 'Quản trị' : 'Thành viên'}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowMembersModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: XEM ẢNH FULL SIZE */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Xem ảnh phóng to" className="max-w-full max-h-[82vh] rounded-2xl shadow-2xl object-contain mx-auto" />
            <div className="mt-3 flex items-center justify-center gap-3">
              <a
                href={previewImage}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 flex items-center gap-1.5 shadow-md"
              >
                <Download className="h-4 w-4" />
                <span>Tải ảnh về máy</span>
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="px-4 py-2 rounded-xl bg-white/20 text-white font-bold text-xs hover:bg-white/30 flex items-center gap-1.5"
              >
                <X className="h-4 w-4" />
                <span>Đóng</span>
              </button>
            </div>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white text-slate-800 flex items-center justify-center font-bold shadow-lg cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
