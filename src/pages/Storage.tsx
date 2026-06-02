import React from 'react';
import { 
  Folder, 
  File, 
  Upload, 
  Share2, 
  Trash2, 
  MoreVertical, 
  Search, 
  Filter, 
  HardDrive, 
  Shield, 
  Users,
  ChevronRight,
  Plus,
  Download,
  ExternalLink,
  Lock,
  Globe
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  orderBy,
  Timestamp,
  getDocs,
  or,
  and
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../lib/authContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { getApiUrl, downloadFile } from '../lib/utils';

const COMPANY_FOLDERS = [
  { id: 'templates', name: 'Biển mẫu công ty', icon: File },
  { id: 'regulations', name: 'Quy định công ty', icon: Shield },
  { id: 'notifications', name: 'Thông báo công ty', icon: Globe },
  { id: 'culture', name: 'Văn hóa công ty', icon: Users },
  { id: 'other', name: 'Tài liệu khác', icon: Folder },
];

export default function Storage() {
  const { user, hasPermission, isDirector, isAdmin } = useAuth();
  const canEdit = isDirector || isAdmin || hasPermission('menu_storage_edit') || hasPermission('manage_storage');
  const [activeTab, setActiveTab] = React.useState<'personal' | 'shared' | 'company'>('personal');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [path, setPath] = React.useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'Gốc' }
  ]);
  
  const [files, setFiles] = React.useState<any[]>([]);
  const [folders, setFolders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = React.useState(false);
  const [showShareModal, setShowShareModal] = React.useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<{ id: string, name: string, type: 'file' | 'folder' } | null>(null);
  const [users, setUsers] = React.useState<any[]>([]);
  const [allRawUsers, setAllRawUsers] = React.useState<any[]>([]);
  
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newFileData, setNewFileData] = React.useState({
    name: '',
    url: '',
    category: 'other',
    type: 'personal' as 'personal' | 'company'
  });
  const [uploadMethod, setUploadMethod] = React.useState<'computer' | 'url'>('computer');
  const [dragActive, setDragActive] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [uploadError, setUploadError] = React.useState('');

  // Reset folder state when switching tabs
  React.useEffect(() => {
    setCurrentFolderId(null);
    setPath([{ id: null, name: 'Gốc' }]);
    setSelectedCategory(null);
  }, [activeTab]);

  React.useEffect(() => {
    if (!user) return;

    setLoading(true);

    let fileQuery;
    let folderQuery;

    const baseType = activeTab === 'company' ? 'company' : 'personal';

    if (activeTab === 'personal') {
      fileQuery = query(
        collection(db, 'stored_files'),
        where('ownerId', '==', user.uid),
        where('type', '==', 'personal'),
        where('folderId', '==', currentFolderId || null),
        orderBy('createdAt', 'desc')
      );
      folderQuery = query(
        collection(db, 'folders'),
        where('ownerId', '==', user.uid),
        where('type', '==', 'personal'),
        where('parentFolderId', '==', currentFolderId || null),
        orderBy('createdAt', 'desc')
      );
    } else if (activeTab === 'shared') {
      fileQuery = query(
        collection(db, 'stored_files'),
        and(
          or(
            where('sharedWith', 'array-contains', user.uid),
            where('sharedWith', 'array-contains', 'all')
          ),
          where('folderId', '==', currentFolderId || null)
        ),
        orderBy('createdAt', 'desc')
      );
      folderQuery = query(
        collection(db, 'folders'),
        and(
          or(
            where('sharedWith', 'array-contains', user.uid),
            where('sharedWith', 'array-contains', 'all')
          ),
          where('parentFolderId', '==', currentFolderId || null)
        ),
        orderBy('createdAt', 'desc')
      );
    } else {
      fileQuery = query(
        collection(db, 'stored_files'),
        where('type', '==', 'company'),
        where('category', '==', selectedCategory || 'other'),
        where('folderId', '==', currentFolderId || null),
        orderBy('createdAt', 'desc')
      );
      folderQuery = query(
        collection(db, 'folders'),
        where('type', '==', 'company'),
        where('category', '==', selectedCategory || 'other'),
        where('parentFolderId', '==', currentFolderId || null),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubFiles = onSnapshot(fileQuery, (snapshot) => {
      setFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stored_files');
      setLoading(false);
    });

    const unsubFolders = onSnapshot(folderQuery, (snapshot) => {
      setFolders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'folders');
    });

    return () => {
      unsubFiles();
      unsubFolders();
    };
  }, [user, activeTab, currentFolderId, selectedCategory]);

  React.useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setAllRawUsers(rawList);

        // Filter valid active personnel for sharing menu:
        // 1. Must be active (accountStatus === 'active')
        // 2. Must not be resigned (workStatus !== 'resigned')
        // 3. Exclude administrative SuperAdmin
        // 4. Must have a real name and real email
        const activePersonnel = rawList.filter(u => {
          const isRealName = u.fullName && u.fullName.trim() !== '';
          const isRealEmail = u.email && u.email.trim() !== '';
          const isActive = u.accountStatus === 'active';
          const isNotResigned = u.workStatus !== 'resigned';
          const isNotAdmin = u.roleId !== 'SuperAdmin';

          return isRealName && isRealEmail && isActive && isNotResigned && isNotAdmin;
        });

        // Deduplicate list by name and email to prevent dual records (such as testing accounts with exact same name or email)
        const uniquePersonnel: any[] = [];
        const seenNames = new Set<string>();
        const seenEmails = new Set<string>();

        activePersonnel.forEach(u => {
          const nameKey = u.fullName.trim().toLowerCase();
          const emailKey = u.email.trim().toLowerCase();

          if (!seenNames.has(nameKey) && !seenEmails.has(emailKey)) {
            seenNames.add(nameKey);
            seenEmails.add(emailKey);
            uniquePersonnel.push(u);
          }
        });

        setUsers(uniquePersonnel);
      } catch (error) {
        console.error("Error fetching users for storage sharing:", error);
      }
    };
    fetchUsers();
  }, []);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFolderName) return;

    try {
      await addDoc(collection(db, 'folders'), {
        name: newFolderName,
        type: activeTab === 'company' ? 'company' : 'personal',
        category: activeTab === 'company' ? (selectedCategory || 'other') : 'other',
        ownerId: user.uid,
        parentFolderId: currentFolderId || null,
        createdAt: new Date().toISOString(),
        sharedWith: []
      });
      setShowCreateFolderModal(false);
      setNewFolderName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'folders');
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const forceDownload = async (url: string | undefined, fileName: string) => {
    if (!url) {
      alert('Không tìm thấy liên kết tải về cho tệp này.');
      return;
    }

    try {
      let fullUrl = url;
      if (url.startsWith('/')) {
        fullUrl = window.location.origin + url;
      }
      await downloadFile(fullUrl, fileName);
    } catch (error) {
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setUploadError('');
    setUploadProgress('loading');

    try {
      let fileUrl = '';
      let fileSize = 0;
      let mimeType = 'application/octet-stream';
      let documentName = '';

      if (uploadMethod === 'computer') {
        if (!selectedFile) {
          throw new Error('Vui lòng chọn một tệp tin từ máy tính.');
        }

        // Convert file to Base64
        const base64Data = await readFileAsBase64(selectedFile);

        // Upload to server
        const response = await fetch(getApiUrl('/api/upload'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: selectedFile.name,
            base64Data,
          }),
        });

        if (!response.ok) {
          const errRes = await response.json().catch(() => ({}));
          throw new Error(errRes.error || 'Tải tệp lên máy chủ không thành công.');
        }

        const data = await response.json();
        fileUrl = data.url;
        fileSize = data.size;
        mimeType = selectedFile.type || 'application/octet-stream';
        documentName = newFileData.name.trim() || selectedFile.name;
      } else {
        if (!newFileData.name || !newFileData.url) {
          throw new Error('Vui lòng nhập tên tài liệu và đường dẫn URL.');
        }
        fileUrl = newFileData.url.trim();
        fileSize = Math.floor(Math.random() * 5000000) + 100000;
        mimeType = 'application/pdf'; // Default fallback
        documentName = newFileData.name.trim();

        // Extrapolate mimeType from extension if possible
        const ext = fileUrl.split('.').pop()?.toLowerCase() || '';
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        else if (['doc', 'docx'].includes(ext)) mimeType = 'application/msword';
        else if (['xls', 'xlsx'].includes(ext)) mimeType = 'application/vnd.ms-excel';
      }

      await addDoc(collection(db, 'stored_files'), {
        name: documentName,
        url: fileUrl,
        category: selectedCategory || 'other',
        type: activeTab === 'company' ? 'company' : 'personal',
        folderId: currentFolderId || null,
        ownerId: user.uid,
        ownerName: currentUserData?.fullName || user.displayName || user.email || 'Hệ thống',
        ownerEmail: currentUserData?.email || user.email || '',
        createdAt: new Date().toISOString(),
        sharedWith: [],
        size: fileSize,
        mimeType,
      });

      setUploadProgress('success');
      setShowUploadModal(false);
      
      // Clean up states
      setNewFileData({ name: '', url: '', category: selectedCategory || 'other', type: activeTab === 'company' ? 'company' : 'personal' });
      setSelectedFile(null);
      setUploadProgress('idle');
    } catch (error: any) {
      console.error("Upload process failed:", error);
      setUploadError(error.message || 'Đã xảy ra lỗi khi tải tệp.');
      setUploadProgress('error');
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!newFileData.name) {
        const dotIndex = file.name.lastIndexOf('.');
        const displayName = dotIndex !== -1 ? file.name.substring(0, dotIndex) : file.name;
        setNewFileData(prev => ({ ...prev, name: displayName }));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!newFileData.name) {
        const dotIndex = file.name.lastIndexOf('.');
        const displayName = dotIndex !== -1 ? file.name.substring(0, dotIndex) : file.name;
        setNewFileData(prev => ({ ...prev, name: displayName }));
      }
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'stored_files', id));
      setShowDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'stored_files');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'folders', id));
      setShowDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'folders');
    }
  };

  const currentUserData = allRawUsers.find(u => u.id === user?.uid);
  const isUserAdminOrManager = currentUserData?.roleId === 'SuperAdmin' || 
                               currentUserData?.roleId === 'Director' || 
                               currentUserData?.roleId === 'ViceDirector' || 
                               currentUserData?.roleId === 'Manager' || 
                               currentUserData?.roleId?.endsWith('_Manager') || 
                               user?.email === 'info.vinasglobal@gmail.com' || 
                               hasPermission('manage_storage') || 
                               hasPermission('menu_storage_edit');

  const confirmDelete = () => {
    if (!showDeleteConfirm) return;
    if (showDeleteConfirm.type === 'file') {
      handleDeleteFile(showDeleteConfirm.id);
    } else {
      handleDeleteFolder(showDeleteConfirm.id);
    }
  };

  const handleToggleShare = async (id: string, userId: string) => {
    // Check files first, then folders
    const item = files.find(f => f.id === id) || folders.find(f => f.id === id);
    if (!item) return;

    const collectionName = files.find(f => f.id === id) ? 'stored_files' : 'folders';
    const sharedWith = item.sharedWith || [];
    const newSharedWith = sharedWith.includes(userId)
      ? sharedWith.filter((id: string) => id !== userId)
      : [...sharedWith, userId];

    try {
      await updateDoc(doc(db, collectionName, id), {
        sharedWith: newSharedWith
      });
      // Update local modal state immediately for consistent presentation
      setShowShareModal((prev: any) => prev && prev.id === id ? { ...prev, sharedWith: newSharedWith } : prev);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, collectionName);
    }
  };

  const handleTabClick = (tab: 'personal' | 'shared' | 'company') => {
    setActiveTab(tab);
    setCurrentFolderId(null);
    setPath([{ id: null, name: 'Gốc' }]);
    setSelectedCategory(null);
  };

  const navigateToFolder = (folder: any) => {
    if (folder.isVirtual) {
      const catId = folder.id.replace('category-', '');
      setSelectedCategory(catId);
      setCurrentFolderId(null);
      setPath([{ id: null, name: 'Gốc' }, { id: folder.id, name: folder.name }]);
    } else {
      setCurrentFolderId(folder.id);
      setPath([...path, { id: folder.id, name: folder.name }]);
    }
  };

  const navigateToPath = (index: number) => {
    const newPath = path.slice(0, index + 1);
    setPath(newPath);
    const targetId = newPath[newPath.length - 1].id;
    if (targetId && targetId.startsWith('category-')) {
      setCurrentFolderId(null);
      setSelectedCategory(targetId.replace('category-', ''));
    } else if (index === 0) {
      setCurrentFolderId(null);
      setSelectedCategory(null);
    } else {
      setCurrentFolderId(targetId);
    }
  };

  const filteredFiles = files.filter(f => (f.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()));
  const filteredFolders = folders.filter(f => (f.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()));

  const isCompanyRoot = activeTab === 'company' && selectedCategory === null;

  const displayFolders = isCompanyRoot
    ? COMPANY_FOLDERS.filter(cat => 
        cat.name.toLowerCase().includes((searchQuery || '').toLowerCase())
      ).map(cat => ({
        id: `category-${cat.id}`,
        name: cat.name,
        isVirtual: true,
        icon: cat.icon
      }))
    : filteredFolders;

  const displayFiles = isCompanyRoot ? [] : filteredFiles;

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <div className="bg-red-50 text-red-600 p-2 rounded-lg"><File size={20} /></div>;
    if (mimeType.includes('image')) return <div className="bg-blue-50 text-blue-600 p-2 rounded-lg"><File size={20} /></div>;
    return <div className="bg-gray-50 text-gray-600 p-2 rounded-lg"><File size={20} /></div>;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <HardDrive className="text-blue-600" />
            Module Lưu Trữ
          </h1>
          <p className="text-gray-500 mt-1">Quản lý tài liệu cá nhân và công ty</p>
        </div>
         <div className="flex items-center gap-3">
           {(isUserAdminOrManager || activeTab === 'personal') && canEdit && (activeTab !== 'company' || selectedCategory !== null) && (
             <button 
               onClick={() => setShowCreateFolderModal(true)}
               className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
             >
               <Plus size={20} />
               Thư mục mới
             </button>
           )}
           {canEdit && (activeTab !== 'company' || selectedCategory !== null) && (
             <button 
               onClick={() => {
                 setNewFileData({ 
                   name: '', 
                   url: '', 
                   category: selectedCategory || 'other', 
                   type: activeTab === 'company' ? 'company' : 'personal' 
                 });
                 setShowUploadModal(true);
               }}
               className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
             >
               <Upload size={20} />
               Tải tệp lên
             </button>
           )}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-2 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-1">
            <button 
              onClick={() => handleTabClick('personal')}
              className={`py-3 px-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-start gap-3 ${activeTab === 'personal' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Lock size={18} />
              Cá nhân
            </button>
            <button 
              onClick={() => handleTabClick('shared')}
              className={`py-3 px-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-start gap-3 ${activeTab === 'shared' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Share2 size={18} />
              Được chia sẻ
            </button>
            <button 
              onClick={() => handleTabClick('company')}
              className={`py-3 px-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-start gap-3 ${activeTab === 'company' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <Globe size={18} />
              Công ty
            </button>
          </div>

          {activeTab === 'company' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Danh mục công ty</h3>
              <div className="space-y-2">
                {COMPANY_FOLDERS.map((cat) => (
                  <button 
                    key={cat.id}
                    onClick={() => { 
                      setSelectedCategory(cat.id); 
                      setCurrentFolderId(null); 
                      setPath([
                        { id: null, name: 'Gốc' },
                        { id: `category-${cat.id}`, name: cat.name }
                      ]); 
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${selectedCategory === cat.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <cat.icon size={18} className={selectedCategory === cat.id ? 'text-blue-600' : 'text-gray-400'} />
                      <span className="font-bold text-sm">{cat.name}</span>
                    </div>
                    {selectedCategory === cat.id && <ChevronRight size={16} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {path.map((p, i) => (
              <React.Fragment key={p.id || 'root'}>
                {i > 0 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
                <button 
                  onClick={() => navigateToPath(i)}
                  className={`text-sm font-bold whitespace-nowrap px-2 py-1 rounded-lg transition-all ${i === path.length - 1 ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  {p.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Tìm kiếm tài liệu và thư mục..."
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
              {/* Folders */}
              {displayFolders.map((folder) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={folder.id} 
                  onClick={() => navigateToFolder(folder)}
                  className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group relative cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4 relative z-10">
                    <div className={`${folder.isVirtual ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'} p-2 rounded-lg`}>
                      {folder.isVirtual && folder.icon ? <folder.icon size={24} /> : <Folder size={24} />}
                    </div>
                    <div className="flex items-center gap-1">
                      {folder.type === 'personal' && (
                        folder.sharedWith?.includes('all') 
                          ? <Globe size={14} className="text-blue-500" title="Chia sẻ toàn công ty" /> 
                          : folder.sharedWith?.length > 0 
                            ? <Users size={14} className="text-blue-500" title="Đã chia sẻ" /> 
                            : <Lock size={14} className="text-gray-400" title="Cá nhân" />
                      )}
                      {!folder.isVirtual && (folder.ownerId === user?.uid || (activeTab === 'company' && isUserAdminOrManager)) && canEdit && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm({ id: folder.id, name: folder.name, type: 'folder' }); }}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Xóa thư mục"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1 truncate relative z-10">{folder.name}</h4>
                  <div className="flex items-center justify-between mt-4 border-t border-gray-50 pt-3 relative z-10">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Thư mục</p>
                    {!folder.isVirtual && folder.ownerId === user?.uid && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowShareModal(folder); }}
                        className="p-2 rounded-lg border border-gray-100 text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all"
                      >
                        <Share2 size={14} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Files */}
              {displayFiles.map((file) => {
                const uploader = allRawUsers.find(u => u.id === file.ownerId);
                const uploaderName = uploader?.fullName || file.ownerName || 'Hệ thống';
                const uploaderEmail = uploader?.email || file.ownerEmail || '';

                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={file.id} 
                    className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group relative flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        {getFileIcon(file.mimeType)}
                        <div className="flex items-center gap-1">
                          {file.type === 'personal' && (
                            file.sharedWith?.includes('all') 
                              ? <Globe size={14} className="text-blue-500" title="Chia sẻ toàn công ty" /> 
                              : file.sharedWith?.length > 0 
                                ? <Users size={14} className="text-blue-500" title="Đã chia sẻ" /> 
                                : <Lock size={14} className="text-gray-400" title="Cá nhân" />
                          )}
                          {(file.ownerId === user?.uid || (activeTab === 'company' && isUserAdminOrManager)) && canEdit && (
                            <button 
                              onClick={() => setShowDeleteConfirm({ id: file.id, name: file.name, type: 'file' })}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <h4 className="font-bold text-gray-900 mb-2 truncate pr-4 text-base" title={file.name}>{file.name}</h4>
                      
                      {/* File Metadata & Uploader Info */}
                      <div className="bg-gray-50/75 p-3.5 rounded-2xl border border-gray-100 mb-4 space-y-2 text-xs">
                        {/* Who uploaded */}
                        <div className="flex items-start gap-1">
                          <span className="font-bold text-[10px] text-gray-400 uppercase tracking-wider shrink-0 w-20">Người up:</span>
                          <div className="truncate min-w-0 flex-1">
                            <span className="font-bold text-gray-800 block truncate" title={uploaderName}>{uploaderName}</span>
                            {uploaderEmail && <span className="text-[10px] text-gray-400 block truncate" title={uploaderEmail}>{uploaderEmail}</span>}
                          </div>
                        </div>

                        {/* When uploaded */}
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[10px] text-gray-400 uppercase tracking-wider shrink-0 w-20">Thời gian:</span>
                          <span className="font-semibold text-gray-600">{format(new Date(file.createdAt), 'HH:mm - dd/MM/yyyy')}</span>
                        </div>

                        {/* File size */}
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[10px] text-gray-400 uppercase tracking-wider shrink-0 w-20">Dung lượng:</span>
                          <span className="font-mono text-gray-600 bg-gray-200/50 px-1.5 py-0.5 rounded text-[10px]">
                            {file.size < 1024 
                              ? `${file.size} B` 
                              : file.size < 1024 * 1024 
                                ? `${(file.size / 1024).toFixed(1)} KB` 
                                : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-gray-50">
                      <button 
                        onClick={() => forceDownload(file.url, file.name)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-blue-600 text-blue-600 rounded-full text-xs font-extrabold hover:bg-blue-50 transition-all"
                      >
                        <Download size={14} className="stroke-[3]" />
                        Tải xuống
                      </button>
                      {file.type === 'personal' && file.ownerId === user?.uid && (
                        <button 
                          onClick={() => setShowShareModal(file)}
                          className="p-2 rounded-xl border border-gray-100 text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all"
                        >
                          <Share2 size={16} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {displayFiles.length === 0 && displayFolders.length === 0 && !loading && (
              <div className="col-span-full py-20 text-center bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-100">
                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <File className="text-gray-200" size={32} />
                </div>
                <p className="text-gray-400 font-bold">Thư mục trống</p>
                <div className="flex items-center justify-center gap-4 mt-4">
                  {(activeTab !== 'company' || selectedCategory !== null) && (
                    <>
                      <button 
                        onClick={() => setShowCreateFolderModal(true)}
                        className="text-blue-600 text-sm font-black uppercase tracking-widest hover:underline"
                      >
                        Tạo thư mục
                      </button>
                      <span className="text-gray-300">•</span>
                      <button 
                        onClick={() => setShowUploadModal(true)}
                        className="text-blue-600 text-sm font-black uppercase tracking-widest hover:underline"
                      >
                        Tải tệp
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Folder Modal */}
      <AnimatePresence>
        {showCreateFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => setShowCreateFolderModal(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <Folder className="text-blue-600" />
                Tạo thư mục mới
              </h2>
              <form onSubmit={handleCreateFolder} className="space-y-6">
                <input 
                  autoFocus
                  required
                  type="text"
                  placeholder="Tên thư mục..."
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 font-medium"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowCreateFolderModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold">Hủy</button>
                  <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-100">Xác nhận</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => {
                if (uploadProgress !== 'loading') {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setUploadError('');
                }
              }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 z-10 my-8"
            >
              <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <Upload className="text-blue-600" />
                Tải lên tài liệu
              </h2>

              {/* Upload Method Switcher */}
              <div className="grid grid-cols-2 p-1 bg-gray-50 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => { setUploadMethod('computer'); setUploadError(''); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${uploadMethod === 'computer' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Từ máy tính
                </button>
                <button
                  type="button"
                  onClick={() => { setUploadMethod('url'); setUploadError(''); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${uploadMethod === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Đường dẫn tệp (URL)
                </button>
              </div>

              {uploadProgress === 'loading' ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <p className="font-bold text-gray-700 text-sm">Đang xử lý tải lên hệ thống...</p>
                  <p className="text-xs text-gray-400">Vui lòng không đóng cửa sổ này</p>
                </div>
              ) : (
                <form onSubmit={handleUpload} className="space-y-6">
                  {uploadMethod === 'computer' ? (
                    <div className="space-y-4">
                      {selectedFile ? (
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-blue-100 text-blue-600 p-2 rounded-xl shrink-0">
                              <File size={24} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 truncate" title={selectedFile.name}>
                                {selectedFile.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {selectedFile.size < 1024 
                                  ? `${selectedFile.size} B` 
                                  : selectedFile.size < 1024 * 1024 
                                    ? `${(selectedFile.size / 1024).toFixed(1)} KB` 
                                    : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedFile(null); }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 transition-all ml-2"
                          >
                            Xóa
                          </button>
                        </div>
                      ) : (
                        <div 
                          onDragEnter={handleDrag}
                          onDragOver={handleDrag}
                          onDragLeave={handleDrag}
                          onDrop={handleDrop}
                          onClick={onButtonClick}
                          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${dragActive ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-blue-400 bg-gray-50'}`}
                        >
                          <Upload size={32} className="text-blue-500 mb-2 animate-bounce" />
                          <p className="text-sm font-bold text-gray-700 text-center">
                            Kéo thả tệp vào đây, hoặc click để chọn một tệp
                          </p>
                          <p className="text-xs text-gray-400 mt-1">Hỗ trợ PDF, Word, Excel, Hình ảnh... tối đa 50MB</p>
                          <input 
                            ref={fileInputRef}
                            type="file" 
                            className="hidden" 
                            onChange={handleFileChange}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Tên hiển thị tài liệu (Tùy chọn)</label>
                        <input 
                          type="text" 
                          placeholder={selectedFile ? selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name : "Nhập tên tài liệu..."} 
                          className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 font-medium" 
                          value={newFileData.name} 
                          onChange={(e) => setNewFileData({...newFileData, name: e.target.value})} 
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Tên hiển thị tài liệu</label>
                        <input 
                          required={uploadMethod === 'url'} 
                          type="text" 
                          placeholder="Nhập tên tài liệu..." 
                          className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 font-medium" 
                          value={newFileData.name} 
                          onChange={(e) => setNewFileData({...newFileData, name: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Đường dẫn tệp (URL)</label>
                        <input 
                          required={uploadMethod === 'url'} 
                          type="url" 
                          placeholder="Nhập đường dẫn URL đến tệp tin..." 
                          className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 font-medium" 
                          value={newFileData.url} 
                          onChange={(e) => setNewFileData({...newFileData, url: e.target.value})} 
                        />
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <p className="text-xs text-red-500 font-bold bg-red-50 p-3 rounded-xl">{uploadError}</p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowUploadModal(false);
                        setSelectedFile(null);
                        setUploadError('');
                      }} 
                      className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                    >
                      Hủy
                    </button>
                    <button 
                      type="submit" 
                      disabled={uploadMethod === 'computer' && !selectedFile}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Xác nhận
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (() => {
          const resolvedItem = files.find(f => f.id === showShareModal.id) || folders.find(f => f.id === showShareModal.id) || showShareModal;
          const sharedWith = resolvedItem.sharedWith || [];
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                onClick={() => setShowShareModal(null)}
                className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
                className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
              >
                <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                  <Share2 className="text-blue-600" />
                  Chia sẻ {resolvedItem.type === 'folder' ? 'thư mục' : 'tài liệu'}
                </h2>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2">
                  {/* Chia sẻ với toàn bộ công ty */}
                  <div className="flex items-center justify-between p-4 bg-blue-50/60 border border-blue-100 rounded-2xl mb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                        <Globe size={18} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-blue-950">Toàn bộ công ty</span>
                        <span className="text-[10px] text-blue-600 font-bold">Chia sẻ với tất cả nhân viên</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleToggleShare(resolvedItem.id, 'all')}
                      className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sharedWith.includes('all') ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'}`}
                    >
                      {sharedWith.includes('all') ? 'Đã share' : 'Share'}
                    </button>
                  </div>

                  {users.filter(u => u.id !== user?.uid).map(u => {
                    const isShared = sharedWith.includes(u.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                        <span className="font-bold text-sm">{u.fullName}</span>
                        <button 
                          onClick={() => handleToggleShare(resolvedItem.id, u.id)}
                          className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isShared ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-400'}`}
                        >
                          {isShared ? 'Đã share' : 'Share'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => setShowShareModal(null)} className="w-full mt-6 py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all">Hoàn tất</button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => setShowDeleteConfirm(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">Xác nhận xóa?</h3>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Bạn có chắc chắn muốn xóa {showDeleteConfirm.type === 'folder' ? 'thư mục' : 'tài liệu'} 
                <span className="font-bold text-gray-900 block mt-1">"{showDeleteConfirm.name}"</span>
                thao tác này không thể hoàn tác.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)} 
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-100"
                >
                  Xác nhận xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Cloud({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.5 19C15.567 19 14 17.433 14 15.5C14 15.3989 14.0044 15.2988 14.0129 15.2C13.5134 15.6322 12.8596 15.8929 12.1466 15.8929C10.7412 15.8929 9.5772 14.8879 9.3242 13.5654C8.9482 13.8444 8.4842 14.0107 7.9821 14.0107C6.8874 14.0107 6 13.1233 6 12.0286C6 11.5173 6.1933 11.0509 6.5103 10.7C5.3629 10.3754 4.5 9.3246 4.5 8.1C4.5 6.6641 5.6641 5.5 7.1 5.5C7.2917 5.5 7.4764 5.5204 7.6534 5.5593C8.4239 4.3315 9.7719 3.5 11.3 3.5C13.6067 3.5 15.5136 5.1769 15.8961 7.3789C16.3986 7.1354 16.9631 7 17.5588 7C19.7354 7 21.5 8.7646 21.5 10.9412C21.5 12.8837 20.0988 14.4984 18.2514 14.8213C18.4116 15.0336 18.5 15.2811 18.5 15.5C18.5 17.433 16.933 19 15 19H17.5Z" />
    </svg>
  );
}
