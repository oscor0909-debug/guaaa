import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Input, Modal, Avatar, ImageViewer } from './components/UI.tsx';
import { Member, ScheduleEvent, ExpenseItem, ExpenseCategory, Booking, TodoItem, TripInfo, DayConfig } from './types.ts';
import { auth, db, storage } from './firebase.ts'; 
// @ts-ignore
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc } from 'firebase/firestore'; 
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; 

// --- Helper Functions ---

const uploadFile = async (file: File, folder: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 1. 基本檢查
    if (!file) {
      alert("未選擇檔案");
      reject(new Error("No file"));
      return;
    }

    // 2. 檢查登入狀態
    if (!auth.currentUser) {
      console.warn("Upload attempted before auth was ready.");
      alert("系統尚未完成登入初始化，請稍後再試。");
      reject(new Error("Auth not ready"));
      return;
    }
    console.log("Starting upload as user:", auth.currentUser.uid);

    try {
      // 3. 建立參照 - 使用更安全的檔名
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageRef = ref(storage, `${folder}/${Date.now()}_${safeName}`);
      
      // 4. 設定 Metadata
      const metadata = { contentType: file.type || 'application/octet-stream' };

      // 5. 上傳
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload is ' + progress + '% done');
        },
        (error) => {
          console.error("Firebase Storage Error:", error);
          let msg = `上傳失敗 (${error.code})`;
          
          if (error.code === 'storage/unauthorized') {
            msg = "權限不足 (403)：請確認您的 Storage 規則已設定，並且已在 Cloud Shell 設定 CORS。";
          } else if (error.code === 'storage/retry-limit-exceeded' || error.message.includes('network')) {
            msg = "網路連線錯誤或 CORS 阻擋：請務必在 Google Cloud Shell 執行 CORS 設定指令 (請參考下方說明)。";
          } else if (error.code === 'storage/object-not-found') {
            msg = "找不到儲存桶 (404)：請檢查 firebase.ts 設定是否正確。";
          }

          alert(msg);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("File available at", downloadURL);
            resolve(downloadURL);
          } catch (urlError) {
            console.error("Get Download URL Error:", urlError);
            reject(urlError);
          }
        }
      );
    } catch (err) {
      console.error("Upload Setup Error:", err);
      alert("上傳初始化失敗，請檢查 Console");
      reject(err);
    }
  });
};

const getDayIndex = (dateStr: string, startDate: string) => {
    const start = new Date(startDate).getTime();
    const current = new Date(dateStr).getTime();
    const diff = Math.round((current - start) / (1000 * 3600 * 24)) + 1;
    return diff;
};

// --- Tab Views ---

// 1. Schedule View
const ScheduleView = ({ 
  events, 
  tripInfo, 
  dayConfigs,
  onUpdateEvent,
  onDeleteEvent,
  onUpdateDayConfig
}: { 
  events: ScheduleEvent[], 
  tripInfo: TripInfo, 
  dayConfigs: Record<string, DayConfig>,
  onUpdateEvent: (event: ScheduleEvent) => Promise<void>,
  onDeleteEvent: (id: string) => Promise<void>,
  onUpdateDayConfig: (date: string, config: { location: string, note: string }) => void
}) => {
  const [selectedDate, setSelectedDate] = useState(tripInfo.startDate);
  const [isUploading, setIsUploading] = useState(false);
  const [isDayEditing, setIsDayEditing] = useState(false);
  const [dayEditForm, setDayEditForm] = useState({ location: '', note: '' });
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const dates = generateTripDates(tripInfo.startDate, tripInfo.durationDays);
    if (!dates.includes(selectedDate)) {
      setSelectedDate(tripInfo.startDate);
    }
  }, [tripInfo]);

  useEffect(() => {
    if (!editingEvent) setShowDeleteConfirm(false);
  }, [editingEvent]);

  const generateTripDates = (start: string, days: number) => {
    const result = [];
    const dateObj = new Date(start);
    for (let i = 0; i < days; i++) {
      result.push(dateObj.toISOString().split('T')[0]);
      dateObj.setDate(dateObj.getDate() + 1);
    }
    return result;
  };

  const dates = generateTripDates(tripInfo.startDate, tripInfo.durationDays);
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  
  const dayEvents = events
    .filter(e => e.date === activeDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const currentDayConfig = dayConfigs[activeDate] || { location: tripInfo.location, note: '規劃精彩的一天' };

  const getMockWeather = (location: string, dateStr: string) => {
    const seed = (location + dateStr).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const weathers = [
      { icon: 'fa-sun', text: '晴朗', temp: 24 },
      { icon: 'fa-cloud-sun', text: '多雲', temp: 22 },
      { icon: 'fa-cloud', text: '陰天', temp: 20 },
      { icon: 'fa-cloud-showers-heavy', text: '陣雨', temp: 19 },
      { icon: 'fa-wind', text: '微風', temp: 21 },
    ];
    return weathers[seed % weathers.length];
  };

  const dailyWeather = getMockWeather(currentDayConfig.location, activeDate);

  const handleOpenDayEdit = () => {
    setDayEditForm({ location: currentDayConfig.location, note: currentDayConfig.note || '' });
    setIsDayEditing(true);
  };

  const handleSaveDayConfig = () => {
    onUpdateDayConfig(activeDate, dayEditForm);
    setIsDayEditing(false);
  };

  const handleCreateEvent = () => {
    setEditingEvent({
        id: '',
        date: activeDate,
        time: '09:00',
        title: '',
        location: '',
        type: 'sightseeing',
        notes: ''
    });
  };

  const handleSaveEvent = async () => {
    if (editingEvent) {
      if (!editingEvent.title) {
          alert('請輸入行程標題');
          return;
      }
      setIsUploading(true);
      try {
        await onUpdateEvent(editingEvent);
        setEditingEvent(null);
      } catch (error) {
        console.error("Save failed", error);
        alert("儲存失敗，請重試");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleConfirmDelete = async () => {
      if (!editingEvent?.id) {
          alert("錯誤：無法讀取行程 ID。");
          return;
      }
      setIsUploading(true);
      try {
        await onDeleteEvent(editingEvent.id);
        setEditingEvent(null);
      } catch(error) {
        console.error("Delete call failed", error);
        alert("刪除操作發生錯誤");
      } finally {
        setIsUploading(false);
        setShowDeleteConfirm(false);
      }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && editingEvent) {
        setIsUploading(true);
        try {
            const url = await uploadFile(e.target.files[0], 'events');
            setEditingEvent({ ...editingEvent, photoUrl: url });
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'food': return 'bg-orange-100 text-orange-600 border-orange-200';
      case 'transport': return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'hotel': return 'bg-purple-100 text-purple-600 border-purple-200';
      case 'shopping': return 'bg-pink-100 text-pink-600 border-pink-200';
      default: return 'bg-primary/20 text-primary border-primary/30';
    }
  };
  
  const getTypeName = (type: string) => {
    const map: Record<string, string> = {
      sightseeing: '景點',
      food: '美食',
      transport: '交通',
      hotel: '住宿',
      shopping: '購物'
    };
    return map[type] || type;
  };

  return (
    <div className="space-y-6 pb-24">
      <Card className="bg-gradient-to-br from-primary to-[#9AC296] border-none text-white shadow-lg overflow-hidden relative">
        <div className="absolute right-[-20px] top-[-20px] text-white/10 text-9xl">
            <i className={`fa-solid ${dailyWeather.icon}`}></i>
        </div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
                 <div className="text-4xl font-bold font-sans leading-none mb-1">Day {getDayIndex(activeDate, tripInfo.startDate)}</div>
                 <div className="text-lg opacity-90 font-medium">
                    {new Date(activeDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                 </div>
            </div>
            <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                    <i className={`fa-solid ${dailyWeather.icon} text-xl`}></i>
                    <span className="text-3xl font-bold">{dailyWeather.temp}°</span>
                </div>
                <div className="text-sm font-medium opacity-90">{dailyWeather.text}</div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
              <div className="flex-1 min-w-0">
                 {/* Google Map Link for Day Location */}
                 <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentDayConfig.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold inline-flex items-center gap-2 mb-2 max-w-full hover:bg-white/30 transition-colors cursor-pointer"
                 >
                    <i className="fa-solid fa-location-dot text-xs shrink-0"></i>
                    <span className="truncate">{currentDayConfig.location}</span>
                </a>
                <p className="text-sm opacity-90 italic border-l-2 border-white/50 pl-2 truncate">
                    "{currentDayConfig.note}"
                </p>
              </div>
               <button onClick={handleOpenDayEdit} className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center hover:bg-white/40 transition-colors backdrop-blur-sm shadow-sm shrink-0">
                <i className="fa-solid fa-pen text-sm"></i>
              </button>
          </div>
        </div>
      </Card>

      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 py-2 -mx-4">
        {dates.length > 0 ? dates.map((date) => (
          <button 
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`flex flex-col items-center justify-center min-w-[64px] h-[72px] rounded-2xl border-2 transition-all ${
              activeDate === date 
              ? 'bg-primary border-primary text-white shadow-soft-sm' 
              : 'bg-white border-stone-200 text-stone-500'
            }`}
          >
            <span className="text-[10px] font-bold uppercase leading-tight">{new Date(date).toLocaleDateString('zh-TW', { weekday: 'short' })}</span>
            <span className="text-xl font-bold leading-tight">{new Date(date).getDate()}</span>
          </button>
        )) : (
             <div className="text-stone-400 text-sm px-2">尚無行程日期</div>
        )}
      </div>

      <div className="space-y-4 px-1">
        {dayEvents.length === 0 ? (
          <div className="text-center py-10 text-stone-400 italic">這天還沒有安排行程！</div>
        ) : (
          dayEvents.map(event => (
            <div key={event.id} className="relative pl-6 border-l-2 border-stone-200 last:border-0">
              <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${getTypeColor(event.type).split(' ')[0]}`}></div>
              <Card className="flex gap-4 items-stretch cursor-pointer hover:bg-stone-50 group" noPadding onClick={() => setEditingEvent(event)}>
                <div className="p-4 flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-lg text-ink">{event.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getTypeColor(event.type)}`}>
                      {getTypeName(event.type)}
                    </span>
                  </div>
                  <div className="text-stone-500 text-sm flex items-center gap-2 mb-2">
                    <i className="fa-regular fa-clock"></i> {event.time}
                    <span className="w-1 h-1 bg-stone-300 rounded-full"></span>
                    {/* Google Map Link for Event Location */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()} // 阻止冒泡，避免打開編輯 Modal
                      className="hover:text-primary hover:underline transition-colors flex items-center gap-1 z-10"
                    >
                        <i className="fa-solid fa-map-pin text-red-400"></i>
                        {event.location}
                    </a>
                  </div>
                  {event.notes && (
                     <div className="bg-stone-100 rounded-lg p-2 text-xs text-stone-500 mt-2">
                        <i className="fa-solid fa-note-sticky mr-1 text-stone-400"></i> {event.notes}
                     </div>
                  )}
                </div>
                <div className="w-28 min-h-[120px] relative self-stretch">
                   {event.photoUrl ? (
                       <img src={event.photoUrl} alt={event.title} className="w-full h-full object-cover rounded-r-2xl absolute inset-0 transition-transform group-hover:scale-105" />
                   ) : (
                        <div className="w-full h-full bg-stone-100 rounded-r-2xl flex items-center justify-center text-stone-300 border-l border-stone-100 transition-colors group-hover:bg-stone-200">
                            <i className="fa-solid fa-image fa-lg"></i>
                        </div>
                   )}
                </div>
              </Card>
            </div>
          ))
        )}
        <Button onClick={handleCreateEvent} className="w-full mt-4 bg-white text-stone-400 border-stone-200 hover:bg-stone-50 shadow-none border-dashed" variant="ghost">
           <i className="fa-solid fa-plus mr-2"></i> 新增行程
        </Button>
      </div>

      <Modal isOpen={isDayEditing} onClose={() => setIsDayEditing(false)} title={`編輯 Day ${getDayIndex(activeDate, tripInfo.startDate)} 資訊`}>
        <div className="space-y-4">
             <Input label="當日地點 / 區域" value={dayEditForm.location} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDayEditForm({...dayEditForm, location: e.target.value})} placeholder="例如：新宿、淺草"/>
            <Input label="今日主題 / 備註" value={dayEditForm.note} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDayEditForm({...dayEditForm, note: e.target.value})} placeholder="例如：穿和服拍照、購物日"/>
            <div className="pt-2"><Button onClick={handleSaveDayConfig} className="w-full">儲存</Button></div>
        </div>
      </Modal>

      <Modal isOpen={!!editingEvent} onClose={() => setEditingEvent(null)} title={editingEvent?.id ? (editingEvent.title ? "編輯行程" : "新增行程") : "新增行程"}>
        {editingEvent && (
          <div className="space-y-4">
            <div>
                 <label className="text-sm font-bold text-stone-500 ml-1 mb-2 block">行程照片</label>
                 {editingEvent.photoUrl ? (
                     <div className="relative h-40 w-full rounded-xl overflow-hidden group border-2 border-stone-200">
                         <img src={editingEvent.photoUrl} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <label className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-white/40 transition-colors">
                                   <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                   <i className="fa-solid fa-pen"></i>
                              </label>
                              <button onClick={() => setEditingEvent({...editingEvent, photoUrl: ''})} className="w-10 h-10 bg-red-500/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors">
                                  <i className="fa-solid fa-trash"></i>
                              </button>
                         </div>
                     </div>
                 ) : (
                     <label className={`h-24 w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all bg-stone-50/50 ${isUploading ? 'border-primary text-primary' : 'border-stone-300 text-stone-400 hover:bg-stone-50 hover:border-primary hover:text-primary'}`}>
                         <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploading} />
                         {isUploading ? (<><i className="fa-solid fa-circle-notch fa-spin text-xl mb-1"></i><span className="text-xs font-bold">上傳中...</span></>) : (<><i className="fa-solid fa-camera text-xl mb-1"></i><span className="text-xs font-bold">上傳照片</span></>)}
                     </label>
                 )}
            </div>
            <Input label="標題" value={editingEvent.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingEvent({...editingEvent, title: e.target.value})} placeholder="行程名稱..."/>
             <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-stone-500 ml-1">類型</label>
                <select className="bg-paper border-2 border-stone-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-sans" value={editingEvent.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditingEvent({...editingEvent, type: e.target.value as any})}>
                    <option value="sightseeing">景點</option>
                    <option value="food">美食</option>
                    <option value="transport">交通</option>
                    <option value="hotel">住宿</option>
                    <option value="shopping">購物</option>
                </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <Input label="時間" type="time" value={editingEvent.time} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingEvent({...editingEvent, time: e.target.value})} />
              <Input label="地點" value={editingEvent.location} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingEvent({...editingEvent, location: e.target.value})} />
            </div>
            <Input label="備註" value={editingEvent.notes || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingEvent({...editingEvent, notes: e.target.value})} placeholder="新增備註..."/>
            
            <div className="pt-2 flex gap-2">
                {!showDeleteConfirm ? (
                    <>
                        {editingEvent.id && (
                          <Button 
                            variant="danger" 
                            type="button" 
                            className="flex-1" 
                            onClick={() => setShowDeleteConfirm(true)} 
                            disabled={isUploading}
                          >
                            刪除
                          </Button>
                        )}
                        <Button onClick={handleSaveEvent} className="flex-[2]" disabled={isUploading} icon={isUploading ? "fa-spinner fa-spin" : undefined}>
                            {isUploading ? '處理中...' : (editingEvent.id ? '確認修改' : '確認新增')}
                        </Button>
                    </>
                ) : (
                    <div className="w-full flex flex-col gap-2 bg-red-50 p-3 rounded-xl border border-red-100 animate-[fadeIn_0.2s_ease-out]">
                        <div className="text-center text-red-500 font-bold mb-1">確定要刪除此行程嗎？</div>
                        <div className="flex gap-2">
                             <Button variant="ghost" className="flex-1 bg-white border-stone-200" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
                             <Button variant="danger" className="flex-1" onClick={handleConfirmDelete} disabled={isUploading}>
                                {isUploading ? '刪除中...' : '確認刪除'}
                             </Button>
                        </div>
                    </div>
                )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// 2. Bookings View
const BookingsView = ({ bookings, onUpdateBooking, onDeleteBooking }: { bookings: Booking[], onUpdateBooking: (b: Booking) => void, onDeleteBooking: (id: string) => void }) => {
  const [activeCategory, setActiveCategory] = useState<'flight' | 'hotel' | 'transport' | 'ticket'>('flight');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Partial<Booking>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 重置刪除確認狀態
  useEffect(() => {
    if (!isEditModalOpen) setShowDeleteConfirm(false);
  }, [isEditModalOpen]);

  const handleAccessSecure = () => {
    if (pin === '007') {
      alert("驗證成功！(此處顯示敏感資訊)");
      setPinModalOpen(false);
      setPin('');
    } else {
      alert("PIN 碼錯誤");
    }
  };

  const handleOpenAdd = () => {
      let defaultType: Booking['type'] = 'flight';
      if(activeCategory === 'hotel') defaultType = 'hotel';
      if(activeCategory === 'transport') defaultType = 'car';
      if(activeCategory === 'ticket') defaultType = 'ticket';

      setEditingBooking({
          id: '',
          type: defaultType,
          title: '',
          referenceNo: '',
          location: '',
          dateStart: '',
          files: [],
          origin: '',
          destination: ''
      });
      setIsEditModalOpen(true);
  };

  const handleOpenEdit = (booking: Booking) => {
      setEditingBooking(booking);
      setIsEditModalOpen(true);
  };

  const handleSave = () => {
      if(!editingBooking.title) return;
      const toSave = {
          ...editingBooking,
          id: editingBooking.id || '', 
          dateStart: editingBooking.dateStart || new Date().toISOString().split('T')[0]
      } as Booking;
      onUpdateBooking(toSave);
      setIsEditModalOpen(false);
  };

  const handleDelete = () => {
      if(editingBooking.id) {
          onDeleteBooking(editingBooking.id);
          setIsEditModalOpen(false);
      } else {
          alert('無法刪除：找不到預訂 ID');
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        setIsUploading(true);
        try {
            const url = await uploadFile(e.target.files[0], 'bookings');
            const newFiles = [...(editingBooking.files || []), url];
            setEditingBooking({ ...editingBooking, files: newFiles });
        } catch (error) {
            console.error("File upload failed", error);
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    }
  };

  const removeFile = (index: number) => {
     const newFiles = [...(editingBooking.files || [])];
     newFiles.splice(index, 1);
     setEditingBooking({ ...editingBooking, files: newFiles });
  };

  const filteredBookings = bookings.filter(b => {
      if (activeCategory === 'flight') return b.type === 'flight';
      if (activeCategory === 'hotel') return b.type === 'hotel';
      if (activeCategory === 'transport') return b.type === 'car'; 
      if (activeCategory === 'ticket') return b.type === 'ticket';
      return false;
  });

  const parseDateTime = (dt: string) => {
      if(!dt) return { date: 'TBD', time: 'TBD' };
      const normalized = dt.replace('T', ' ');
      const parts = normalized.split(' ');
      return { date: parts[0] || 'TBD', time: parts[1] || '00:00' };
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex justify-between items-center px-1 mb-2">
         <div className="flex items-center gap-3">
             <h2 className="text-2xl font-bold text-ink">我的預訂</h2>
             <button onClick={handleOpenAdd} className="w-9 h-9 rounded-full bg-secondary text-white shadow-soft-sm flex items-center justify-center hover:brightness-110 active:scale-95 transition-all">
                <i className="fa-solid fa-plus text-sm"></i>
             </button>
         </div>
         <button onClick={() => setPinModalOpen(true)} className="w-10 h-10 rounded-full bg-white border-2 border-stone-200 text-stone-400 hover:bg-stone-50 hover:text-primary hover:border-primary shadow-soft-sm flex items-center justify-center transition-all active:scale-95">
            <i className="fa-solid fa-lock"></i>
         </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-2 px-2">
          {[{ id: 'flight', label: '機票', icon: 'fa-plane' }, { id: 'hotel', label: '住宿', icon: 'fa-hotel' }, { id: 'transport', label: '交通', icon: 'fa-car' }, { id: 'ticket', label: '憑證', icon: 'fa-ticket' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveCategory(tab.id as any)} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-bold transition-all ${activeCategory === tab.id ? 'bg-ink text-white border-ink shadow-soft translate-y-[-2px]' : 'bg-white border-stone-200 text-stone-400 hover:bg-stone-50'}`}>
                  <i className={`fa-solid ${tab.icon} ${activeCategory === tab.id ? 'text-white' : 'text-stone-300'}`}></i>{tab.label}
              </button>
          ))}
      </div>
      
      <div className="space-y-4 animate-[fadeIn_0.2s_ease-out] min-h-[300px]">
         {filteredBookings.length === 0 ? (
             <div className="text-center py-16 text-stone-300 font-bold border-2 border-dashed border-stone-200 rounded-3xl bg-stone-50/50 flex flex-col items-center gap-3">
                 <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center"><i className="fa-solid fa-folder-open text-2xl opacity-50"></i></div>
                 <div className="text-sm">尚無資料</div>
                 <Button onClick={handleOpenAdd} variant="ghost" className="text-xs text-primary border-primary border-dashed bg-white"><i className="fa-solid fa-plus"></i> 新增</Button>
             </div>
         ) : (
            filteredBookings.map(booking => (
                <div key={booking.id} className="relative transition-transform active:scale-[0.99] cursor-pointer" onClick={() => handleOpenEdit(booking)}>
                    <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleOpenEdit(booking); }} className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-white border border-stone-200 text-stone-500 shadow-sm flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors">
                        <i className="fa-solid fa-pen text-xs"></i>
                    </button>
                    {booking.type === 'flight' ? (
                        <div className="bg-white rounded-2xl border-2 border-stone-200 shadow-soft overflow-hidden">
                        <div className="bg-primary h-2"></div>
                        <div className="p-5">
                            <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2 text-stone-500 font-bold"><i className="fa-solid fa-plane-departure"></i><span>登機證</span></div>
                            <span className="text-primary font-bold tracking-widest mr-8">{booking.referenceNo}</span>
                            </div>
                            <div className="flex justify-between items-center mb-6">
                            <div><div className="text-3xl font-bold text-ink">{booking.origin || 'DEP'}</div><div className="text-xs text-stone-400">出發</div></div>
                            <div className="flex-1 px-4 flex flex-col items-center"><div className="w-full h-[2px] bg-stone-200 relative"><i className="fa-solid fa-plane absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-stone-400 bg-white px-2"></i></div><span className="text-xs text-stone-400 mt-2">To</span></div>
                            <div><div className="text-3xl font-bold text-ink">{booking.destination || 'ARR'}</div><div className="text-xs text-stone-400">抵達</div></div>
                            </div>
                            <div className="flex justify-between border-t border-dashed border-stone-200 pt-4">
                            <div><span className="text-xs text-stone-400 block">日期</span><span className="font-bold text-ink">{parseDateTime(booking.dateStart).date}</span></div>
                            <div><span className="text-xs text-stone-400 block">時間</span><span className="font-bold text-ink">{parseDateTime(booking.dateStart).time}</span></div>
                            <div><span className="text-xs text-stone-400 block">名稱</span><span className="font-bold text-ink">{booking.title}</span></div>
                            </div>
                            {/* Flight Images */}
                            {booking.files && booking.files.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-stone-100 flex gap-2 overflow-x-auto no-scrollbar">
                                    {booking.files.map((file, idx) => (
                                        <div key={idx} 
                                             className="w-16 h-16 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 cursor-zoom-in hover:brightness-95 transition-all"
                                             onClick={(e) => { e.stopPropagation(); setPreviewImage(file); }}
                                        >
                                            <img src={file} alt="憑證" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        </div>
                    ) : booking.type === 'ticket' ? (
                        <div className="bg-white rounded-2xl border-2 border-stone-200 shadow-soft flex overflow-hidden flex-col">
                            <div className="flex relative">
                                <div className="bg-secondary w-3 border-r-2 border-dashed border-stone-200 relative shrink-0">
                                    <div className="absolute -top-2 -right-[9px] w-4 h-4 bg-[#F7F4EB] rounded-full border-2 border-stone-200"></div>
                                    <div className="absolute -bottom-2 -right-[9px] w-4 h-4 bg-[#F7F4EB] rounded-full border-2 border-stone-200"></div>
                                </div>
                                <div className="flex-1 p-4 flex gap-3">
                                    <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center text-secondary shrink-0"><i className="fa-solid fa-ticket fa-lg"></i></div>
                                    <div className="flex-1 min-w-0 pr-6">
                                        <h3 className="font-bold text-ink text-lg truncate">{booking.title}</h3>
                                        <div className="text-xs text-stone-400 mb-1">{parseDateTime(booking.dateStart).date} {parseDateTime(booking.dateStart).time}</div>
                                        <div className="inline-block bg-stone-100 px-2 py-0.5 rounded text-[10px] font-bold text-stone-500">NO. {booking.referenceNo}</div>
                                    </div>
                                    {booking.files && booking.files.length > 0 && (
                                        <div className="w-16 h-16 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 cursor-zoom-in hover:shadow-md transition-all relative z-10"
                                             onClick={(e) => { e.stopPropagation(); setPreviewImage(booking.files![0]); }}>
                                            <img src={booking.files[0]} alt="憑證" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity">
                                                <i className="fa-solid fa-magnifying-glass"></i>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Card>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-4">
                                <div className="w-16 h-16 bg-stone-100 rounded-xl flex items-center justify-center text-stone-300 shrink-0"><i className={`fa-solid ${booking.type === 'hotel' ? 'fa-hotel' : 'fa-car'} fa-xl`}></i></div>
                                <div className="flex-1 pr-6">
                                <h3 className="font-bold text-ink text-lg">{booking.title}</h3>
                                <p className="text-sm text-stone-500 mb-2"><i className="fa-solid fa-map-pin mr-1"></i> {booking.location || '未指定地點'}</p>
                                <div className="flex justify-between items-end">
                                    <div className="inline-block bg-stone-100 px-2 py-1 rounded-md text-xs font-bold text-stone-600">編號: {booking.referenceNo}</div>
                                    <div className="text-xs font-bold text-stone-400">{parseDateTime(booking.dateStart).date}</div>
                                </div>
                                </div>
                                {booking.files && booking.files.length > 0 && (
                                    <div className="w-16 h-16 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 cursor-zoom-in hover:brightness-95 transition-all"
                                         onClick={(e) => { e.stopPropagation(); setPreviewImage(booking.files![0]); }}
                                    >
                                        <img src={booking.files[0]} alt="憑證" className="w-full h-full object-cover" />
                                    </div>
                                )}
                            </div>
                        </div>
                        </Card>
                    )}
                </div>
            ))
         )}
      </div>

      <ImageViewer url={previewImage} onClose={() => setPreviewImage(null)} />

      <Modal isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} title="安全檢查">
        <div className="space-y-4">
          <div className="flex justify-center py-4"><div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center"><i className="fa-solid fa-shield-halved text-3xl text-stone-300"></i></div></div>
          <p className="text-stone-500 text-center text-sm">請輸入 PIN 碼以解鎖加密文件夾。<br/>(預設: 007)</p>
          <Input type="password" value={pin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPin(e.target.value)} placeholder="PIN" className="text-center text-2xl tracking-widest font-bold"/>
          <Button onClick={handleAccessSecure} className="w-full">解鎖</Button>
        </div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={editingBooking.id ? '編輯預訂' : '新增預訂'}>
          <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-stone-500 ml-1">類型</label>
                <select className="bg-paper border-2 border-stone-200 rounded-xl px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-sans" value={editingBooking.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditingBooking({...editingBooking, type: e.target.value as any})}>
                    <option value="flight">機票</option><option value="hotel">住宿</option><option value="car">交通/租車</option><option value="ticket">憑證/票券</option>
                </select>
            </div>
            <Input label="標題 / 名稱" placeholder="例如：JL123、新宿飯店" value={editingBooking.title || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, title: e.target.value})} />
            <Input label="參考編號 / 訂位代號" value={editingBooking.referenceNo || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, referenceNo: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
                <Input label="開始時間" type="datetime-local" value={editingBooking.dateStart || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, dateStart: e.target.value})} />
                <Input label="結束時間 (選填)" type="datetime-local" value={editingBooking.dateEnd || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, dateEnd: e.target.value})} />
            </div>
            
            {/* Conditional Fields based on Booking Type */}
            {editingBooking.type === 'flight' ? (
                 <div className="grid grid-cols-2 gap-4">
                    <Input label="出發地 (代碼)" placeholder="例如: TPE" value={editingBooking.origin || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, origin: e.target.value})} />
                    <Input label="目的地 (代碼)" placeholder="例如: NRT" value={editingBooking.destination || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, destination: e.target.value})} />
                 </div>
            ) : (
                 <Input label="地點" value={editingBooking.location || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBooking({...editingBooking, location: e.target.value})} />
            )}
            
            {/* 新增圖片上傳區塊 */}
            <div>
              <label className="text-sm font-bold text-stone-500 ml-1 mb-2 block">相關圖片 / 憑證 (車票、QR Code)</label>
              <div className="flex gap-2 flex-wrap">
                {editingBooking.files?.map((file, index) => (
                  <div key={index} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-stone-200 group cursor-zoom-in" onClick={() => setPreviewImage(file)}>
                     <img src={file} className="w-full h-full object-cover" />
                     <button
                       onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                       className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                     >
                       <i className="fa-solid fa-times"></i>
                     </button>
                  </div>
                ))}

                <label className={`w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${isUploading ? 'bg-stone-100 border-stone-300' : 'border-primary text-primary hover:bg-primary/5'}`}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={isUploading} />
                  {isUploading ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                     <>
                       <i className="fa-solid fa-plus text-lg mb-1"></i>
                       <span className="text-[10px] font-bold">上傳</span>
                     </>
                  )}
                </label>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
                {!showDeleteConfirm ? (
                  <>
                    {editingBooking.id && (
                        <Button 
                            variant="danger" 
                            type="button" 
                            className="flex-1" 
                            onClick={() => setShowDeleteConfirm(true)}
                        >
                            刪除
                        </Button>
                    )}
                    <Button onClick={handleSave} className="flex-[2]" disabled={isUploading}>{editingBooking.id ? '儲存變更' : '確認新增'}</Button>
                  </>
                ) : (
                     <div className="w-full flex flex-col gap-2 bg-red-50 p-3 rounded-xl border border-red-100 animate-[fadeIn_0.2s_ease-out]">
                        <div className="text-center text-red-500 font-bold mb-1">確定要刪除此預訂嗎？</div>
                        <div className="flex gap-2">
                             <Button variant="ghost" className="flex-1 bg-white border-stone-200" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
                             <Button variant="danger" className="flex-1" onClick={handleDelete}>確認刪除</Button>
                        </div>
                    </div>
                )}
            </div>
          </div>
      </Modal>
    </div>
  );
};

// 3. Expense View
const ExpenseView = ({ expenses, members, onAddExpense, onDeleteExpense, tripInfo }: { 
    expenses: ExpenseItem[], 
    members: Member[],
    onAddExpense: (item: ExpenseItem) => void,
    onDeleteExpense: (id: string) => void,
    tripInfo: TripInfo
}) => {
  const [subTab, setSubTab] = useState<'list' | 'details' | 'tax'>('list');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDetailMember, setSelectedDetailMember] = useState<string | 'all'>('all');
  const [price, setPrice] = useState<string>('');
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [taxRate, setTaxRate] = useState<0.08 | 0.10>(0.10);
  const [hasServiceFee, setHasServiceFee] = useState(true);
  const [defaultExchangeRate, setDefaultExchangeRate] = useState<number>(0.22); // Default Exchange Rate
  const [newExpense, setNewExpense] = useState<Partial<ExpenseItem> & { splitWith: string[] }>({
    description: '',
    amount: '' as any,
    category: ExpenseCategory.FOOD,
    currency: 'JPY',
    exchangeRate: 0.22,
    payerId: '',
    splitWith: [],
    date: new Date().toISOString().split('T')[0]
  });
  // State for delete confirmation
  const [expenseToDelete, setExpenseToDelete] = useState<{id: string, description: string} | null>(null);

  useEffect(() => {
      if (showAddModal && members.length > 0 && newExpense.splitWith.length === 0) {
          setNewExpense(prev => ({
              ...prev,
              payerId: members[0].id,
              splitWith: members.map(m => m.id)
          }));
      }
  }, [members, showAddModal]);

  const expensesByDate = useMemo(() => {
    const groups: Record<string, ExpenseItem[]> = {};
    expenses.forEach(item => {
        const date = item.date;
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
    });
    return groups;
  }, [expenses]);
  
  const sortedDates = Object.keys(expensesByDate).sort((a, b) => b.localeCompare(a));
  
  const categoryLabels: Record<string, string> = {
    [ExpenseCategory.FOOD]: '美食', [ExpenseCategory.TRANSPORT]: '交通', [ExpenseCategory.SHOPPING]: '購物',
    [ExpenseCategory.ACCOMMODATION]: '住宿', [ExpenseCategory.TICKET]: '票券', [ExpenseCategory.OTHER]: '雜項'
  };

  const getCategoryColor = (cat: ExpenseCategory) => {
      switch(cat) {
          case ExpenseCategory.FOOD: return 'bg-orange-400 border-orange-200';
          case ExpenseCategory.SHOPPING: return 'bg-pink-400 border-pink-200';
          case ExpenseCategory.TRANSPORT: return 'bg-blue-400 border-blue-200';
          default: return 'bg-primary border-primary/50';
      }
  };

  const { balanceList, transfers } = useMemo(() => {
    const balances: Record<string, number> = {};
    members.forEach(m => balances[m.id] = 0);
    expenses.forEach(exp => {
        const amount = Number(exp.amount) || 0;
        const rate = Number(exp.exchangeRate) || (exp.currency === 'TWD' ? 1 : 0.22);
        const amountTWD = amount * rate;
        const splitWith = exp.splitWith || [];
        const splitCount = splitWith.length;
        if(splitCount === 0) return;
        const amountPerPerson = amountTWD / splitCount;
        const payerId = exp.payerId;
        if (balances[payerId] !== undefined) balances[payerId] += amountTWD;
        splitWith.forEach(uid => {
            if (balances[uid] !== undefined) balances[uid] -= amountPerPerson;
        });
    });
    
    // 生成原始的結算列表 (用於顯示每個人現在是欠錢還是被欠錢)
    const list = Object.entries(balances).map(([id, amount]) => {
        const member = members.find(m => m.id === id);
        return { id, amount, member: member || { id, name: '未知', avatar: '' } };
    });

    // 關鍵修正：複製一份 list 來進行轉帳建議的計算
    // 因為轉帳計算邏輯會扣減金額直到平衡，若使用原始 list 會導致 UI 顯示大家都歸零
    const calcList = list.map(item => ({ ...item }));

    const debtors = calcList.filter(b => b.amount < -1).sort((a, b) => a.amount - b.amount); 
    const creditors = calcList.filter(b => b.amount > 1).sort((a, b) => b.amount - a.amount);
    const suggestedTransfers = [];
    let i = 0; let j = 0;
    while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i]; let creditor = creditors[j];
        let amount = Math.min(Math.abs(debtor.amount), creditor.amount);
        suggestedTransfers.push({ from: debtor.member, to: creditor.member, amount: Math.floor(amount) });
        debtor.amount += amount; creditor.amount -= amount;
        if (Math.abs(debtor.amount) < 1) i++;
        if (creditor.amount < 1) j++;
    }
    return { balanceList: list, transfers: suggestedTransfers };
  }, [expenses, members]);

  // Specific member details calculation
  const memberDetailData = useMemo(() => {
      if (selectedDetailMember === 'all') return null;

      const related = expenses.filter(e => 
          e.payerId === selectedDetailMember || (e.splitWith && e.splitWith.includes(selectedDetailMember))
      ).sort((a, b) => b.date.localeCompare(a.date));

      let totalPaid = 0;
      let totalShare = 0;

      related.forEach(e => {
          const amountVal = Number(e.amount) * Number(e.exchangeRate || 0.22);
          if (e.payerId === selectedDetailMember) {
              totalPaid += amountVal;
          }
          if (e.splitWith && e.splitWith.includes(selectedDetailMember)) {
              totalShare += amountVal / e.splitWith.length;
          }
      });

      return { list: related, totalPaid, totalShare, net: totalPaid - totalShare };
  }, [expenses, selectedDetailMember]);

  const calcRefund = () => {
    const p = parseFloat(price); 
    if (isNaN(p)) return { taxAmount: 0, fee: 0, finalRefund: 0 };
    
    let taxAmount = taxIncluded ? p - (p / (1 + taxRate)) : p * taxRate;
    
    // 計算手續費：如果開啟手續費，則為總金額 (含稅) 的 1.55%，否則為 0
    const totalWithTax = taxIncluded ? p : p * (1 + taxRate);
    const fee = hasServiceFee ? totalWithTax * 0.0155 : 0;
    
    return { taxAmount: Math.floor(taxAmount), fee: Math.floor(fee), finalRefund: Math.floor(taxAmount - fee) };
  };

  const toggleSplitMember = (memberId: string) => {
    const current = newExpense.splitWith || [];
    if (current.includes(memberId)) setNewExpense({ ...newExpense, splitWith: current.filter(id => id !== memberId) });
    else setNewExpense({ ...newExpense, splitWith: [...current, memberId] });
  };
  
  const handleOpenAddExpense = () => {
    setNewExpense({
        description: '',
        amount: '' as any,
        category: ExpenseCategory.FOOD,
        currency: 'JPY',
        exchangeRate: defaultExchangeRate,
        payerId: members.length > 0 ? members[0].id : '',
        splitWith: members.map(m => m.id),
        date: new Date().toISOString().split('T')[0]
    });
    setShowAddModal(true);
  };

  const handleSubmitExpense = () => {
    if(!newExpense.amount || Number(newExpense.amount) <= 0) return;
    const item: ExpenseItem = {
        id: '', description: newExpense.description || '未命名項目', amount: Number(newExpense.amount), currency: newExpense.currency || 'JPY', category: newExpense.category as ExpenseCategory,
        payerId: newExpense.payerId || members[0]?.id || '', splitWith: newExpense.splitWith, date: newExpense.date || new Date().toISOString().split('T')[0],
        exchangeRate: Number(newExpense.exchangeRate) || 0.22,
    };
    onAddExpense(item);
    setShowAddModal(false);
  };

  // 獨立的記帳刪除函數 - Updated to use Modal state
  const handleDeleteExpenseClick = (id: string, desc: string) => {
      setExpenseToDelete({ id, description: desc });
  };

  const handleConfirmDeleteExpense = () => {
      if (expenseToDelete) {
          onDeleteExpense(expenseToDelete.id);
          setExpenseToDelete(null);
      }
  };

  return (
    <div className="space-y-6 pb-24">
       <div className="bg-stone-200/50 p-1 rounded-2xl flex justify-between">
            {[{ id: 'list', label: '記帳列表' }, { id: 'details', label: '明細' }, { id: 'tax', label: '退稅' }].map(tab => (
                <button key={tab.id} onClick={() => setSubTab(tab.id as any)} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${subTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-stone-400 hover:text-stone-500'}`}>{tab.label}</button>
            ))}
       </div>

       {subTab === 'list' && (
           <div className="animate-[fadeIn_0.2s_ease-out]">
             <div className="flex justify-end mb-4">
                 <button onClick={handleOpenAddExpense} className="bg-secondary text-white font-bold rounded-2xl px-4 py-2 flex items-center gap-2 shadow-soft hover:brightness-110 active:scale-95 transition-all"><i className="fa-solid fa-plus"></i> 新增一筆</button>
             </div>
             
             {/* 總支出與匯率設定卡片 */}
             <div className="bg-white rounded-3xl border-2 border-primary/30 p-6 mb-6 shadow-sm">
                <div className="text-center mb-4">
                    <span className="text-stone-400 text-sm font-bold mb-1 block">總支出 (TWD)</span>
                    <span className="text-4xl font-bold text-ink">
                        ${Math.floor(expenses.reduce((acc, curr) => acc + (Number(curr.amount) * Number(curr.exchangeRate || 0.22)), 0)).toLocaleString()}
                    </span>
                </div>
                
                {/* 預設匯率設定區塊 */}
                <div className="bg-stone-50 rounded-xl p-3 flex justify-between items-center border border-stone-100">
                    <div className="text-xs font-bold text-stone-500 flex items-center gap-2">
                        <i className="fa-solid fa-coins text-primary"></i> 
                        目前預設匯率
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-400 font-bold">1 JPY ≈</span>
                        <input
                            type="number"
                            step="0.001"
                            value={defaultExchangeRate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDefaultExchangeRate(parseFloat(e.target.value))}
                            className="w-16 bg-white border border-stone-200 rounded-lg px-2 py-1 text-center font-bold text-ink text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                        <span className="text-xs text-stone-400 font-bold">TWD</span>
                    </div>
                </div>
             </div>

             <div className="space-y-6">
                {sortedDates.map(date => (
                    <div key={date}>
                        <div className="text-xs font-bold text-stone-400 mb-2 pl-2">{date}</div>
                        <div className="space-y-3">
                            {expensesByDate[date].map(item => {
                                const payerName = members.find(m => m.id === item.payerId)?.name || '未知';
                                const splitCount = item.splitWith.length;
                                const isAll = splitCount === members.length && members.length > 0;
                                let splitText = '';
                                if (isAll) {
                                    splitText = '全員分攤';
                                } else if (splitCount === 0) {
                                    splitText = '無人分攤';
                                } else if (splitCount <= 2) {
                                    const names = item.splitWith.map(id => members.find(m => m.id === id)?.name).filter(n=>n).join(', ');
                                    splitText = `分給: ${names}`;
                                } else {
                                    splitText = `分給 ${splitCount} 人`;
                                }

                                return (
                                    <Card key={item.id} className="flex justify-between items-center py-3">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-lg shrink-0">
                                                {item.category === ExpenseCategory.FOOD ? '🍜' : item.category === ExpenseCategory.TRANSPORT ? '🚕' : item.category === ExpenseCategory.SHOPPING ? '🛍️' : '💸'}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-ink truncate">{item.description}</div>
                                                <div className="text-[10px] text-stone-400 flex items-center flex-wrap gap-1">
                                                     <span className="font-bold bg-stone-100 px-1 rounded text-stone-500">{payerName}</span>
                                                     <span>付款</span>
                                                     <span className="text-stone-300">|</span>
                                                     <span>{splitText}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-2">
                                            <div className="font-bold text-ink whitespace-nowrap">{item.currency} {Number(item.amount).toLocaleString()}</div>
                                            <button onClick={() => handleDeleteExpenseClick(item.id, item.description)} className="text-stone-300 hover:text-red-500 transition-colors p-1"><i className="fa-solid fa-trash text-[10px]"></i></button>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                ))}
             </div>
           </div>
       )}

       {subTab === 'details' && (
        <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2 -mx-2 px-2 pb-2">
                <button 
                    onClick={() => setSelectedDetailMember('all')} 
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all whitespace-nowrap shrink-0 ${selectedDetailMember === 'all' ? 'bg-ink text-white border-ink' : 'bg-white border-stone-200 text-stone-400'}`}
                >
                    <span className="font-bold text-sm">全員總覽</span>
                </button>
                {members.map(m => (
                    <button 
                        key={m.id}
                        onClick={() => setSelectedDetailMember(m.id)}
                        className={`flex items-center gap-2 px-2 py-1 pr-4 rounded-full border-2 transition-all whitespace-nowrap shrink-0 ${selectedDetailMember === m.id ? 'bg-primary text-white border-primary' : 'bg-white border-stone-200 text-stone-400'}`}
                    >
                        <Avatar url={m.avatar} size="sm" className="w-6 h-6"/>
                        <span className="font-bold text-sm">{m.name}</span>
                    </button>
                ))}
            </div>

            {selectedDetailMember === 'all' ? (
                <>
                    <Card>
                        <h3 className="font-bold mb-4">應收/應付總覽</h3>
                        <div className="space-y-3">
                            {balanceList.map(b => (
                                <div key={b.id} className="flex justify-between items-center">
                                    <div className="flex items-center gap-2"><Avatar url={b.member.avatar} size="sm" /><span>{b.member.name}</span></div>
                                    <span className={`font-bold ${b.amount >= 0 ? 'text-primary' : 'text-red-500'}`}>{b.amount >= 0 ? `+${Math.floor(b.amount)}` : Math.floor(b.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card>
                        <h3 className="font-bold mb-4">結算建議</h3>
                        <div className="space-y-2">
                            {transfers.map((t, i) => (
                                <div key={i} className="text-sm bg-stone-50 p-2 rounded-lg flex justify-between">
                                    <span>{t.from.name} ➡️ {t.to.name}</span>
                                    <span className="font-bold">${t.amount}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            ) : memberDetailData && (
                <div className="animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white rounded-3xl border-2 border-stone-200 p-4 mb-4 shadow-soft">
                        <div className="text-center mb-4">
                            <div className="text-sm text-stone-400 font-bold">淨額 (Net Balance)</div>
                            <div className={`text-3xl font-bold ${memberDetailData.net >= 0 ? 'text-primary' : 'text-red-500'}`}>
                                {memberDetailData.net >= 0 ? `+${Math.floor(memberDetailData.net)}` : Math.floor(memberDetailData.net)}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-primary/10 rounded-2xl p-3 text-center">
                                <div className="text-xs text-primary font-bold mb-1">總墊付 (Paid)</div>
                                <div className="font-bold text-lg text-primary">${Math.floor(memberDetailData.totalPaid)}</div>
                            </div>
                            <div className="bg-orange-100 rounded-2xl p-3 text-center">
                                <div className="text-xs text-orange-500 font-bold mb-1">應分攤 (Share)</div>
                                <div className="font-bold text-lg text-orange-500">${Math.floor(memberDetailData.totalShare)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {memberDetailData.list.map(item => {
                             const isPayer = item.payerId === selectedDetailMember;
                             const isSplit = item.splitWith && item.splitWith.includes(selectedDetailMember);
                             const myShare = isSplit ? (Number(item.amount) * Number(item.exchangeRate || 0.22)) / item.splitWith.length : 0;
                             
                             return (
                                <div key={item.id} className="bg-white rounded-xl border border-stone-200 p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isPayer ? 'bg-primary text-white' : 'bg-stone-100 text-stone-400'}`}>
                                            {isPayer ? <i className="fa-solid fa-hand-holding-dollar"></i> : <i className="fa-solid fa-user-group"></i>}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-ink">{item.description}</div>
                                            <div className="text-[10px] text-stone-400">{item.date}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {isPayer && (
                                            <div className="text-xs font-bold text-primary">墊 +{Math.floor(Number(item.amount) * Number(item.exchangeRate || 0.22))}</div>
                                        )}
                                        {isSplit && (
                                            <div className="text-xs font-bold text-orange-500">攤 -{Math.floor(myShare)}</div>
                                        )}
                                    </div>
                                </div>
                             )
                        })}
                        {memberDetailData.list.length === 0 && <div className="text-center text-stone-400 text-sm py-4">無相關帳務紀錄</div>}
                    </div>
                </div>
            )}
        </div>
       )}

       {subTab === 'tax' && (
           <div className="animate-[fadeIn_0.2s_ease-out]">
             <Card className="space-y-6">
               <div className="text-center">
                 <h3 className="text-xl font-bold text-ink mb-1">退稅試算 (日本)</h3>
                 <p className="text-xs text-stone-400">快速計算預計退稅金額</p>
               </div>

               {/* Amount Input */}
               <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                 <label className="block text-sm font-bold text-stone-500 mb-2">消費金額 (JPY)</label>
                 <input
                   type="number"
                   value={price}
                   onChange={(e) => setPrice(e.target.value)}
                   placeholder="輸入金額..."
                   className="w-full text-3xl font-bold text-center bg-transparent outline-none text-ink placeholder-stone-200"
                 />
               </div>

               {/* Controls */}
               <div className="grid grid-cols-2 gap-4">
                  {/* Tax Type */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400">金額類型</label>
                    <div className="flex bg-stone-100 rounded-xl p-1">
                      <button onClick={() => setTaxIncluded(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${taxIncluded ? 'bg-white shadow-sm text-primary' : 'text-stone-400'}`}>含稅</button>
                      <button onClick={() => setTaxIncluded(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!taxIncluded ? 'bg-white shadow-sm text-primary' : 'text-stone-400'}`}>未稅</button>
                    </div>
                  </div>

                  {/* Tax Rate */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400">稅率</label>
                    <div className="flex bg-stone-100 rounded-xl p-1">
                      <button onClick={() => setTaxRate(0.10)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${taxRate === 0.10 ? 'bg-white shadow-sm text-ink' : 'text-stone-400'}`}>10%</button>
                      <button onClick={() => setTaxRate(0.08)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${taxRate === 0.08 ? 'bg-white shadow-sm text-ink' : 'text-stone-400'}`}>8%</button>
                    </div>
                  </div>
               </div>

               {/* Service Fee Toggle */}
               <div className="flex items-center justify-between bg-stone-50 px-4 py-3 rounded-xl">
                  <span className="text-sm font-bold text-stone-500">扣除手續費 (約1.55%)</span>
                  <button
                    onClick={() => setHasServiceFee(!hasServiceFee)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${hasServiceFee ? 'bg-primary' : 'bg-stone-200'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${hasServiceFee ? 'left-7' : 'left-1'}`}></div>
                  </button>
               </div>

               {/* Results */}
               <div className="bg-primary/10 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-stone-500">消費稅額</span>
                    <span className="font-bold text-ink">¥{calcRefund().taxAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-stone-500">手續費</span>
                    <span className="font-bold text-red-400">-¥{calcRefund().fee.toLocaleString()}</span>
                  </div>
                  <div className="h-[1px] bg-primary/20 my-2"></div>
                  <div className="flex justify-between items-end">
                    <span className="font-bold text-primary">預計退款</span>
                    <span className="text-3xl font-bold text-primary">¥{calcRefund().finalRefund.toLocaleString()}</span>
                  </div>
               </div>
             </Card>
           </div>
       )}

       <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增支出">
            <div className="space-y-4">
                <Input label="說明" value={newExpense.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExpense({...newExpense, description: e.target.value})} />
                <div className="flex gap-3">
                    <div className="flex-1">
                        <Input label="金額" type="number" value={newExpense.amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExpense({...newExpense, amount: e.target.value as any})} />
                    </div>
                    <div className="w-24 flex flex-col gap-1">
                        <label className="text-sm font-bold text-stone-500 ml-1">幣別</label>
                        <select
                            className="bg-paper border-2 border-stone-200 rounded-xl px-2 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-sans text-center font-bold"
                            value={newExpense.currency}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                const curr = e.target.value;
                                setNewExpense({
                                    ...newExpense,
                                    currency: curr,
                                    exchangeRate: curr === 'TWD' ? 1 : defaultExchangeRate
                                });
                            }}
                        >
                            <option value="JPY">JPY</option>
                            <option value="TWD">TWD</option>
                        </select>
                    </div>
                </div>
                
                {/* 顯示並允許調整匯率 (僅在非台幣時顯示) */}
                {newExpense.currency !== 'TWD' && (
                    <div className="flex flex-col gap-1 bg-stone-50 p-2 rounded-xl border border-stone-200">
                        <label className="text-xs font-bold text-stone-400 ml-1 flex justify-between">
                            <span>當下匯率 (1 JPY = ? TWD)</span>
                            <span className="text-[10px] text-stone-300">預設: {defaultExchangeRate}</span>
                        </label>
                        <input
                            type="number"
                            step="0.001"
                            className="bg-white border border-stone-200 rounded-lg px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 font-bold text-ink"
                            value={newExpense.exchangeRate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExpense({ ...newExpense, exchangeRate: parseFloat(e.target.value) })}
                        />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <select className="bg-paper border-2 border-stone-200 rounded-xl px-4 py-3" value={newExpense.payerId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewExpense({...newExpense, payerId: e.target.value})}>
                        {members.map(m => (<option key={m.id} value={m.id}>{m.name} 付款</option>))}
                    </select>
                    <select className="bg-paper border-2 border-stone-200 rounded-xl px-4 py-3" value={newExpense.category} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewExpense({...newExpense, category: e.target.value as any})}>
                        {Object.values(ExpenseCategory).map(cat => (<option key={cat} value={cat}>{categoryLabels[cat]}</option>))}
                    </select>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {members.map(m => (
                        <button key={m.id} onClick={() => toggleSplitMember(m.id)} className={`px-3 py-1 rounded-full border-2 text-xs font-bold ${newExpense.splitWith?.includes(m.id) ? 'bg-primary/10 border-primary text-primary' : 'border-stone-200'}`}>{m.name}</button>
                    ))}
                </div>
                <Button onClick={handleSubmitExpense} className="w-full">送出</Button>
            </div>
       </Modal>
       
       <Modal isOpen={!!expenseToDelete} onClose={() => setExpenseToDelete(null)} title="刪除確認">
            <div className="space-y-4">
                <p className="text-center text-stone-600">
                    確定要刪除「<span className="font-bold text-ink">{expenseToDelete?.description}</span>」這筆款項嗎？
                </p>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setExpenseToDelete(null)} className="flex-1 bg-stone-100 border-stone-200">取消</Button>
                    <Button variant="danger" onClick={handleConfirmDeleteExpense} className="flex-1">確認刪除</Button>
                </div>
            </div>
       </Modal>
    </div>
  );
};

// 4. Planning View
const PlanningView = ({ todos, onAddTodo, onToggleTodo, onDeleteTodo }: { 
    todos: TodoItem[], 
    onAddTodo: (text: string, type: TodoItem['type']) => void,
    onToggleTodo: (id: string, currentStatus: boolean) => void,
    onDeleteTodo: (id: string) => void
}) => {
  const [activeCategory, setActiveCategory] = useState<TodoItem['type']>('general');
  const [newTodoText, setNewTodoText] = useState('');

  const handleAdd = () => {
      if (!newTodoText.trim()) return;
      onAddTodo(newTodoText, activeCategory);
      setNewTodoText('');
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex gap-2">
        {['packing', 'shopping', 'general'].map(type => (
          <button key={type} onClick={() => setActiveCategory(type as any)} className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${activeCategory === type ? 'bg-primary border-primary text-white' : 'bg-white border-stone-200 text-stone-400'}`}>
            {type === 'packing' ? '行李' : type === 'shopping' ? '購物' : '待辦'}
          </button>
        ))}
      </div>

      <Card>
        <div className="space-y-2 min-h-[200px]">
          {todos.filter(t => t.type === activeCategory).map(item => (
            <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-stone-50 rounded-lg">
                <input type="checkbox" checked={item.completed} onChange={() => onToggleTodo(item.id, item.completed)} className="w-5 h-5 accent-primary" />
                <span className={`flex-1 font-bold ${item.completed ? 'text-stone-300 line-through' : ''}`}>{item.text}</span>
                <button onClick={() => onDeleteTodo(item.id)} className="text-stone-300 hover:text-red-500"><i className="fa-solid fa-trash-can text-sm"></i></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Input placeholder="新增..." className="flex-1" value={newTodoText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTodoText(e.target.value)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleAdd()} />
          <Button onClick={handleAdd} variant="secondary">新增</Button>
        </div>
      </Card>
    </div>
  );
};

// 5. Members View
const MembersView = ({ members, onAddMember, onUpdateMember, onDeleteMember }: { members: Member[], onAddMember: (name: string, file: File | null) => void, onUpdateMember: (id: string, name: string, file: File | null) => Promise<void>, onDeleteMember: (id: string) => Promise<void> }) => {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
    
    // State for Editing
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [editName, setEditName] = useState('');
    const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null); // Separate file state for editing
    const [editAvatarPreview, setEditAvatarPreview] = useState<string>(''); // For previewing before upload

    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Initialize edit form when a member is selected
    useEffect(() => {
        if (editingMember) {
            setEditName(editingMember.name);
            setEditAvatarPreview(editingMember.avatar);
            setEditAvatarFile(null);
            setShowDeleteConfirm(false);
        }
    }, [editingMember]);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        await onAddMember(newName, newAvatarFile);
        setIsAddOpen(false);
        setNewName('');
        setNewAvatarFile(null);
    };

    const handleSaveEdit = async () => {
        if (!editingMember || !editName.trim()) return;
        setIsUpdating(true);
        try {
            await onUpdateMember(editingMember.id, editName, editAvatarFile);
            setEditingMember(null); // Close modal on success
        } catch (error) {
            console.error("Update failed", error);
            alert("更新失敗");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setEditAvatarFile(file);
            // Create a preview URL
            const previewUrl = URL.createObjectURL(file);
            setEditAvatarPreview(previewUrl);
        }
    };

    // 修改後的刪除函數
    const handleDelete = async () => {
        if (!editingMember?.id) {
            alert("錯誤：無法讀取成員 ID。");
            return;
        }

        setIsDeleting(true);
        try {
            await onDeleteMember(editingMember.id);
            setEditingMember(null);
        } catch (error) {
            console.error("Delete member failed", error);
            alert("移除成員失敗");
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <div className="space-y-6 pb-32">
            <div className="grid grid-cols-2 gap-4">
                {members.map(m => (
                    <Card key={m.id} className="flex flex-col items-center py-6 gap-2" onClick={() => setEditingMember(m)}>
                        <Avatar url={m.avatar} size="lg" />
                        <div className="font-bold">{m.name}</div>
                    </Card>
                ))}
                <Card className="flex flex-col items-center justify-center py-6 border-dashed border-stone-300 bg-stone-50 cursor-pointer" onClick={() => setIsAddOpen(true)}>
                    <i className="fa-solid fa-plus text-stone-300 text-2xl"></i>
                </Card>
            </div>

            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="新增旅伴">
                <div className="space-y-4">
                    <Input label="暱稱" value={newName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)} />
                    <Button onClick={handleAdd} className="w-full">加入</Button>
                </div>
            </Modal>
            
            <Modal isOpen={!!editingMember} onClose={() => setEditingMember(null)} title="編輯成員">
                {editingMember && (
                    <div className="space-y-6">
                        <div className="flex flex-col items-center">
                            <div className="relative group cursor-pointer w-24 h-24">
                                <Avatar url={editAvatarPreview} className="w-24 h-24 mx-auto" />
                                <label className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <i className="fa-solid fa-camera text-white text-xl"></i>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleEditFileChange} />
                                </label>
                            </div>
                            <span className="text-xs text-stone-400 mt-2">點擊更換頭像</span>
                        </div>

                        <Input label="暱稱" value={editName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)} />

                        <div className="pt-2 flex flex-col gap-3">
                             {!showDeleteConfirm ? (
                                <div className="flex gap-2">
                                    {editingMember.id && (
                                        <Button 
                                            variant="danger" 
                                            type="button" 
                                            className="flex-1" 
                                            onClick={() => setShowDeleteConfirm(true)} 
                                            disabled={isUpdating || isDeleting}
                                        >
                                            移除
                                        </Button>
                                    )}
                                    <Button 
                                        onClick={handleSaveEdit} 
                                        className="flex-[2]" 
                                        disabled={isUpdating || isDeleting}
                                    >
                                        {isUpdating ? '儲存中...' : '儲存變更'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="w-full flex flex-col gap-2 bg-red-50 p-3 rounded-xl border border-red-100 animate-[fadeIn_0.2s_ease-out]">
                                    <div className="text-center text-red-500 font-bold mb-1">確定要移除此成員嗎？</div>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" className="flex-1 bg-white border-stone-200" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
                                        <Button variant="danger" className="flex-1" onClick={handleDelete} disabled={isDeleting}>確認移除</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'bookings' | 'expense' | 'planning' | 'members'>('schedule');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tripInfo, setTripInfo] = useState<TripInfo>({ title: '東京冒險之旅', location: '日本東京', startDate: '2023-11-15', durationDays: 5 });
  const [isTripEditing, setIsTripEditing] = useState(false);
  const [tripEditForm, setTripEditForm] = useState(tripInfo);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]); 
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dayConfigs, setDayConfigs] = useState<Record<string, DayConfig>>({});

  useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) { 
              setCurrentUser(user); 
              setLoading(false); 
          } else { 
              signInAnonymously(auth).catch(() => setLoading(false)); 
          }
      });
      return () => unsubscribe();
  }, []);

  // CRITICAL FIX: Ensure `id` comes from `doc.id` and we explicitly REMOVE any id field from doc.data()
  // to prevent overriding the real document ID with garbage data.
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "events"));
    return onSnapshot(q, (snapshot) => { 
        setScheduleEvents(snapshot.docs.map(d => {
            const data = d.data();
            // 強制刪除資料內可能存在的 id 欄位，避免覆蓋真正的 doc.id
            if ('id' in data) delete data.id;
            return { ...data, id: d.id } as ScheduleEvent;
        })); 
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "expenses"));
    return onSnapshot(q, (snapshot) => { setExpenses(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ExpenseItem))); });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "bookings"));
    return onSnapshot(q, (snapshot) => { setBookings(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Booking))); });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "todos")); 
    return onSnapshot(q, (snapshot) => { setTodos(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as TodoItem))); });
  }, [currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      return onSnapshot(doc(db, "trips", "main"), (doc) => {
          if (doc.exists()) { setTripInfo(doc.data() as TripInfo); } 
      });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "members")); 
    return onSnapshot(q, (snapshot) => { 
        setMembers(snapshot.docs.map(d => {
            const data = d.data();
            // 強制刪除資料內可能存在的 id 欄位，避免覆蓋真正的 doc.id
            if ('id' in data) delete data.id;
            return { ...data, id: d.id } as Member;
        })); 
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "day_configs")); 
    return onSnapshot(q, (snapshot) => { 
        const configs: Record<string, DayConfig> = {};
        snapshot.docs.forEach(doc => { configs[doc.id] = { ...doc.data(), date: doc.id } as DayConfig; });
        setDayConfigs(configs); 
    });
  }, [currentUser]);

  const handleUpdateTrip = async () => { await setDoc(doc(db, "trips", "main"), tripEditForm); setIsTripEditing(false); };
  const handleAddExpense = async (newItem: ExpenseItem) => { const { id, ...data } = newItem; await addDoc(collection(db, "expenses"), data); };
  const handleDeleteExpense = async (id: string) => { await deleteDoc(doc(db, "expenses", id)); };
  const handleAddTodo = async (text: string, type: TodoItem['type']) => { await addDoc(collection(db, "todos"), { text, type, completed: false }); };
  const handleToggleTodo = async (id: string, currentStatus: boolean) => { await updateDoc(doc(db, "todos", id), { completed: !currentStatus }); };
  const handleDeleteTodo = async (id: string) => { await deleteDoc(doc(db, "todos", id)); };
  
  const handleUpdateScheduleEvent = async (updatedEvent: ScheduleEvent) => { 
      const { id, ...data } = updatedEvent;
      // 確保將 undefined 的值過濾掉，但保留必要的欄位
      const sanitizedData = JSON.parse(JSON.stringify(data));
      // 確保不會把 id 寫入資料庫欄位
      if ('id' in sanitizedData) delete sanitizedData.id;

      if (id) { 
          await updateDoc(doc(db, "events", id), sanitizedData); 
      } else { 
          await addDoc(collection(db, "events"), sanitizedData); 
      } 
  };
  
  const handleDeleteScheduleEvent = async (id: string) => { 
      try {
          // 強制指定文件路徑進行刪除
          const eventRef = doc(db, "events", id);
          console.log("刪除文件路徑:", eventRef.path);
          await deleteDoc(eventRef); 
          alert("行程刪除成功！");
      } catch (e) {
          console.error("Firebase delete error:", e);
          alert("刪除錯誤：" + (e instanceof Error ? e.message : "未知錯誤"));
          throw e;
      }
  };

  const handleUpdateBooking = async (updatedBooking: Booking) => { const { id, ...data } = updatedBooking; if (id) { await updateDoc(doc(db, "bookings", id), data); } else { await addDoc(collection(db, "bookings"), data); } };
  const handleDeleteBooking = async (id: string) => { await deleteDoc(doc(db, "bookings", id)); };
  
  const handleAddMember = async (name: string, file: File | null) => { 
      let avatarUrl = 'https://ui-avatars.com/api/?background=random&name=' + name; 
      if (file) { avatarUrl = await uploadFile(file, 'avatars'); } 
      await addDoc(collection(db, "members"), { name, avatar: avatarUrl }); 
  };
  
  const handleUpdateMember = async (id: string, name: string, file: File | null) => {
    try {
      const updateData: any = { name };
      if (file) {
        const url = await uploadFile(file, 'avatars');
        updateData.avatar = url;
      }
      await updateDoc(doc(db, "members", id), updateData);
    } catch (e) {
      console.error("Update member failed", e);
      throw e;
    }
  };

  const handleDeleteMember = async (id: string) => { 
      try {
          const memberRef = doc(db, "members", id);
          console.log("刪除成員路徑:", memberRef.path);
          await deleteDoc(memberRef); 
          alert("成員移除成功！");
      } catch (e) {
          console.error("Firebase delete member error:", e);
          alert("移除成員錯誤：" + (e instanceof Error ? e.message : "未知錯誤"));
          throw e;
      }
  };
  const handleUpdateDayConfig = async (date: string, config: { location: string, note: string }) => { await setDoc(doc(db, "day_configs", date), config); };

  const renderContent = () => {
    switch(activeTab) {
      case 'schedule': return (<ScheduleView events={scheduleEvents} tripInfo={tripInfo} dayConfigs={dayConfigs} onUpdateEvent={handleUpdateScheduleEvent} onDeleteEvent={handleDeleteScheduleEvent} onUpdateDayConfig={handleUpdateDayConfig} />);
      case 'bookings': return (<BookingsView bookings={bookings} onUpdateBooking={handleUpdateBooking} onDeleteBooking={handleDeleteBooking} />);
      case 'expense': return <ExpenseView expenses={expenses} members={members} onAddExpense={handleAddExpense} onDeleteExpense={handleDeleteExpense} tripInfo={tripInfo} />;
      case 'planning': return <PlanningView todos={todos} onAddTodo={handleAddTodo} onToggleTodo={handleToggleTodo} onDeleteTodo={handleDeleteTodo} />;
      case 'members': return <MembersView members={members} onAddMember={handleAddMember} onUpdateMember={handleUpdateMember} onDeleteMember={handleDeleteMember} />;
      default: return null;
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F7F4EB]">載入中...</div>;

  return (
    <div className="min-h-screen font-sans text-ink bg-[#F7F4EB] pb-20">
      <header className="sticky top-0 z-30 bg-[#F7F4EB]/90 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-stone-200/50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsTripEditing(true)}>
          <h1 className="text-xl font-bold text-primary truncate max-w-[200px]">{tripInfo.title}</h1>
          <i className="fa-solid fa-pen text-xs text-stone-400"></i>
        </div>
        <div className="flex -space-x-2">
          {members.slice(0, 3).map(m => (<Avatar key={m.id} url={m.avatar} size="sm" />))}
        </div>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto">{renderContent()}</main>
      <div className="fixed bottom-6 left-4 right-4 max-w-lg mx-auto z-40">
        <div className="bg-white rounded-3xl shadow-soft-lg border-2 border-stone-200 flex justify-around items-center px-1 py-3">
          {[{ id: 'schedule', icon: 'fa-calendar-days' }, { id: 'bookings', icon: 'fa-ticket' }, { id: 'expense', icon: 'fa-wallet' }, { id: 'planning', icon: 'fa-clipboard-check' }, { id: 'members', icon: 'fa-users' }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-soft-sm' : 'text-stone-400'}`}>
              <i className={`fa-solid ${tab.icon} text-lg`}></i>
            </button>
          ))}
        </div>
      </div>
       <Modal isOpen={isTripEditing} onClose={() => setIsTripEditing(false)} title="編輯旅程">
        <div className="space-y-4">
            <Input label="標題" value={tripEditForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTripEditForm({...tripEditForm, title: e.target.value})} />
            <Input label="地點" value={tripEditForm.location} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTripEditForm({...tripEditForm, location: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="出發日期" type="date" value={tripEditForm.startDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTripEditForm({...tripEditForm, startDate: e.target.value})} />
              <Input label="天數" type="number" value={tripEditForm.durationDays} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTripEditForm({...tripEditForm, durationDays: Number(e.target.value)})} />
            </div>
            <Button onClick={handleUpdateTrip} className="w-full">儲存</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;