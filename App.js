import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View, Share, Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const configured = URL.startsWith('https://') && KEY.length > 20;
const supabase = configured ? createClient(URL, KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
}) : null;

const C = {
  bg:'#E6F3F1', card:'#FFFFFF', ink:'#102A3A', muted:'#4D6874', blue:'#087F73',
  pale:'#BFE5DD', green:'#086B59', red:'#C62828', line:'#B8D8D1', amber:'#A97816'
};

function Btn({ title, onPress, kind='primary', disabled=false, small=false }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress}
    style={[s.btn, kind==='light' && s.btnLight, kind==='danger' && s.btnDanger,
      disabled && {opacity:.45}, small && {paddingVertical:8,paddingHorizontal:12}]}>
    <Text style={[s.btnText, kind==='light' && {color:C.blue}, small && {fontSize:12}]}>{title}</Text>
  </TouchableOpacity>;
}
function Field({ value, onChangeText, placeholder, keyboardType='default', secureTextEntry=false, multiline=false, style }) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor="#9AA6B2" keyboardType={keyboardType} secureTextEntry={secureTextEntry}
    multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
    style={[s.input, multiline && {minHeight:76}, style]} />;
}
function Header({ title, subtitle }) {
  return <View style={s.header}><Text style={s.brand}>JUNIOR STORAGE</Text>
    <Text style={s.heading}>{title}</Text>{subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}</View>;
}
function Empty({ text }) { return <View style={s.empty}><Text style={s.emptyText}>{text}</Text></View>; }

function getIranDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part = type => parts.find(x => x.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function formatIranDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(new Date(value));
}
function formatIranDay(value) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'
  }).format(new Date(value));
}
function buildDailyReport(history, type) {
  const days = new Map();
  history.filter(x=>x.type===type && x.created_at).forEach(x=>{
    const key=getIranDateKey(x.created_at);
    if(!days.has(key)) days.set(key,{key,date:x.created_at,total:0,products:new Map()});
    const day=days.get(key), name=x.item_name||'محصول بدون نام', qty=Number(x.quantity||0);
    day.total+=qty;
    day.products.set(name,(day.products.get(name)||0)+qty);
  });
  return Array.from(days.values()).sort((a,b)=>b.key.localeCompare(a.key));
}

function groupHistoryByDay(history, type) {
  const days = new Map();
  history.filter(x => x.type === type && x.created_at).forEach(x => {
    const key = getIranDateKey(x.created_at);
    if (!days.has(key)) days.set(key, { key, date: x.created_at, entries: [] });
    days.get(key).entries.push(x);
  });
  return Array.from(days.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export default function App() {
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(true);
  const [tab,setTab] = useState('stock');
  const [items,setItems] = useState([]);
  const [history,setHistory] = useState([]);
  const [busy,setBusy] = useState(false);
  const [username,setUsername] = useState('');
  const [password,setPassword] = useState('');
  const [newName,setNewName] = useState('');
  const [newPackaging,setNewPackaging] = useState('');
  const [newDescription,setNewDescription] = useState('');
  const [editingPackaging,setEditingPackaging] = useState('');
  const [editingDescription,setEditingDescription] = useState('');
  const [reportPeriod,setReportPeriod] = useState('week');
  const [reportRows,setReportRows] = useState([]);
  const [reportLoading,setReportLoading] = useState(false);
  const [contact,setContact] = useState({title:'ارتباط با ما',phone:'',email:'',description:''});
  const [contactDraft,setContactDraft] = useState({title:'ارتباط با ما',phone:'',email:'',description:''});
  const [users,setUsers] = useState([]);
  const [userUsername,setUserUsername] = useState('');
  const [userPassword,setUserPassword] = useState('');
  const [userName,setUserName] = useState('');
  const [userRole,setUserRole] = useState('staff');
  const [permissions,setPermissions] = useState({view_stock:true,record_in:false,record_out:false,manage_products:false});
  const [usersLoading,setUsersLoading] = useState(false);
  const [expandedUsers,setExpandedUsers] = useState({});
  const [selectedUserId,setSelectedUserId] = useState(null);
  const [editingUserId,setEditingUserId] = useState(null);
  const [editUsername,setEditUsername] = useState('');
  const [editPassword,setEditPassword] = useState('');
  const [editUserBusy,setEditUserBusy] = useState(false);
  const [roleMenuOpen,setRoleMenuOpen] = useState(false);
  const [darkMode,setDarkMode] = useState(false);
  const [palette,setPalette] = useState('teal');
  const [profileInfo,setProfileInfo] = useState(null);
  const [editingItemId,setEditingItemId] = useState(null);
  const [editingItemName,setEditingItemName] = useState('');
  const [quantities,setQuantities] = useState({});
  const [search,setSearch] = useState('');

  const isAdmin = profile?.role === 'admin';
  const can = key => isAdmin || (profile?.role==='viewer' && key==='view_stock') || (profile?.permissions && profile.permissions[key] === true);
  const activeColors = darkMode ? {bg:'#101923',card:'#1B2936',ink:'#F2F6F8',muted:'#B7C5D0',line:'#405568',pale:'#284D59',blue:'#48D2C0',green:'#65C9A8',red:'#F07878'} : (palette==='blue' ? {bg:'#E3ECF8',card:'#F9FBFF',ink:'#10233D',muted:'#4D6079',line:'#C0D0E5',pale:'#C6D8F1',blue:'#205FAE',green:'#08765E',red:'#C62828'} : palette==='purple' ? {bg:'#EEE5F5',card:'#FCF9FF',ink:'#28183D',muted:'#5E4B70',line:'#D2C0E2',pale:'#DCC8EF',blue:'#68409B',green:'#16745A',red:'#C62828'} : C);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let alive = true;

    const restoreSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) {
        Alert.alert('خطای ورود', error.message);
        setLoading(false);
        return;
      }
      setSession(data.session ?? null);
    };

    restoreSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) {
        setSession(nextSession ?? null);
      }
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadAccount = async () => {
      if (!session || !supabase) {
        setProfile(null);
        setItems([]);
        setHistory([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setProfile(null);

      try {
        const { data: p, error: profileError } = await supabase
          .from('profiles')
          .select('id, role, display_name, permissions, email')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          throw new Error(
            profileError.code === 'PGRST116'
              ? 'برای این حساب در جدول profiles پروفایل پیدا نشد.'
              : profileError.message
          );
        }

        if (!p || !['admin', 'viewer', 'staff'].includes(p.role)) {
          throw new Error('نقش حساب معتبر نیست.');
        }

        if (!alive) return;
        setProfile(p);
        setProfileInfo({email:session.user.email || p.email || '',id:p.id,display_name:p.display_name || ''});

        const [inventoryResult, movementResult] = await Promise.all([
          supabase.from('inventory').select('*').order('created_at', { ascending: true }),
          supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(300)
        ]);

        if (inventoryResult.error) throw new Error(inventoryResult.error.message);
        if (movementResult.error) throw new Error(movementResult.error.message);

        if (alive) {
          setItems(inventoryResult.data || []);
          setHistory(movementResult.data || []);
        }
      } catch (error) {
        if (alive) {
          setProfile(null);
          Alert.alert('خطای دریافت حساب', error.message || 'اطلاعات حساب دریافت نشد.');
          await supabase.auth.signOut();
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadAccount();

    const refreshData = async () => {
      if (!alive || !session || !supabase) return;
      const [inventoryResult, movementResult] = await Promise.all([
        supabase.from('inventory').select('*').order('created_at', { ascending: true }),
        supabase.from('movements').select('*').order('created_at', { ascending: false }).limit(300)
      ]);
      if (!alive) return;
      if (!inventoryResult.error) setItems(inventoryResult.data || []);
      if (!movementResult.error) setHistory(movementResult.data || []);
    };

    const channel = supabase.channel(`junior-storage-live-${session?.user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, refreshData)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [session]);

  async function refresh() {
    if (!supabase || !session) return;
    const [a,b] = await Promise.all([
      supabase.from('inventory').select('*').order('created_at', { ascending: true }),
      supabase.from('movements').select('*').order('created_at',{ascending:false}).limit(300)
    ]);
    if (!a.error) setItems(a.data || []);
    if (!b.error) setHistory(b.data || []);
  }

  async function login() {
    if (!configured) return Alert.alert('اتصال تنظیم نشده','ابتدا آدرس و کلید Supabase را در فایل .env وارد کنید و برنامه را دوباره اجرا کنید.');
    if (!username.trim() || !password) return Alert.alert('ورودی ناقص','نام کاربری و رمز عبور را وارد کنید.');
    setBusy(true);
    try {
      const {data,error}=await supabase.functions.invoke('username-login',{body:{username:username.trim().toLowerCase(),password}});
      if(error || !data?.access_token || !data?.refresh_token) throw new Error(data?.error || error?.message || 'نام کاربری یا رمز عبور اشتباه است.');
      const {error:sessionError}=await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
      if(sessionError) throw sessionError;
    } catch(e) { Alert.alert('ورود ناموفق',e.message||'خطای نامشخص'); }
    finally { setBusy(false); }
  }
  async function logout() { await supabase.auth.signOut(); setPassword(''); }
  async function addItem() {
    const name = newName.trim();
    if (!name) return Alert.alert('نام محصول را وارد کنید');
    setBusy(true);
    const {error} = await supabase.from('inventory').insert({name,quantity:0,packaging_type:newPackaging.trim(),description:newDescription.trim()});
    setBusy(false);
    if (error) Alert.alert('خطا',error.message);
    else { setNewName(''); setNewPackaging(''); setNewDescription(''); refresh(); }
  }
  function startEditItem(item) {
    setEditingItemId(item.id);
    setEditingItemName(item.name || '');
    setEditingPackaging(item.packaging_type || '');
    setEditingDescription(item.description || '');
  }
  async function saveItemEdit() {
    const name = editingItemName.trim();
    if (!name) return Alert.alert('نام محصول را وارد کنید');
    setBusy(true);
    const {error} = await supabase.from('inventory').update({name,packaging_type:editingPackaging.trim(),description:editingDescription.trim()}).eq('id',editingItemId);
    setBusy(false);
    if (error) Alert.alert('ویرایش انجام نشد',error.message);
    else { setEditingItemId(null); setEditingItemName(''); setEditingPackaging(''); setEditingDescription(''); await refresh(); }
  }
  function confirmDeleteItem(item) {
    Alert.alert('حذف محصول',`محصول «${item.name}» حذف شود؟`,[
      {text:'انصراف',style:'cancel'},
      {text:'حذف',style:'destructive',onPress:()=>deleteItem(item)}
    ]);
  }
  async function deleteItem(item) {
    setBusy(true);
    const {error} = await supabase.from('inventory').delete().eq('id',item.id);
    setBusy(false);
    if (error) Alert.alert('حذف انجام نشد',error.message);
    else { if (editingItemId===item.id) {setEditingItemId(null);setEditingItemName('');} await refresh(); }
  }
  async function submitMovement(type) {
    const lines = items.map(i => ({item_id:i.id, quantity:Math.floor(Number(quantities[i.id] || 0))}))
      .filter(x => x.quantity > 0);
    if (!lines.length) return Alert.alert('تعداد وارد نشده','حداقل برای یک محصول تعداد وارد کنید.');
    if (lines.some(x => !Number.isInteger(x.quantity) || x.quantity < 1))
      return Alert.alert('عدد نامعتبر','تعداد باید عدد صحیح و بیشتر از صفر باشد.');
    setBusy(true);
    const {error} = await supabase.rpc('record_bulk_movement',{p_type:type,p_lines:lines});
    setBusy(false);
    if (error) Alert.alert('ثبت انجام نشد',error.message);
    else { setQuantities({}); await refresh(); Alert.alert('ثبت شد','تمام ردیف‌ها با موفقیت ثبت شدند.'); }
  }

  async function removeMovementRecord(movement) {
    // Deleting a history record must never change the current inventory quantity.
    const { error } = await supabase.from('movements').delete().eq('id', movement.id);
    if (error) throw new Error(error.message);
  }

  function confirmDeleteMovement(movement) {
    Alert.alert('حذف رکورد', `رکورد «${movement.item_name || 'محصول'}» فقط از تاریخچه حذف شود؟ موجودی انبار تغییری نمی‌کند.`, [
      { text: 'انصراف', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await removeMovementRecord(movement);
          await refresh();
        } catch (error) {
          Alert.alert('حذف انجام نشد', error.message || 'خطای نامشخص');
          await refresh();
        } finally { setBusy(false); }
      }}
    ]);
  }

  function confirmDeleteAllMovements(type) {
    const records = history.filter(x => x.type === type);
    if (!records.length) return Alert.alert('تاریخچه خالی است', 'رکوردی برای حذف وجود ندارد.');
    const label = type === 'in' ? 'ورودی' : 'خروجی';
    Alert.alert(`حذف همه تاریخچه ${label}`, `تمام ${records.length.toLocaleString('fa-IR')} رکورد ${label} از تاریخچه حذف شوند؟ موجودی انبار تغییری نمی‌کند.`, [
      { text: 'انصراف', style: 'cancel' },
      { text: 'حذف همه', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          for (const movement of records) {
            await removeMovementRecord(movement);
          }
          await refresh();
          Alert.alert('انجام شد', `تاریخچه ${label} حذف شد. موجودی انبار بدون تغییر باقی ماند.`);
        } catch (error) {
          Alert.alert('حذف کامل نشد', `${error.message || 'خطای نامشخص'}\nاطلاعات دوباره بارگذاری شد؛ ممکن است بخشی از رکوردها حذف شده باشند.`);
          await refresh();
        } finally { setBusy(false); }
      }}
    ]);
  }

  function getReportRange(period) {
    // Use Tehran local dates and Persian calendar months/years; week begins Saturday.
    const shiftedNow = new Date(Date.now() + 210 * 60000);
    const currentDate = new Date(Date.UTC(shiftedNow.getUTCFullYear(),shiftedNow.getUTCMonth(),shiftedNow.getUTCDate()));
    const persianParts = date => {
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);
      const get = type => Number(parts.find(x=>x.type===type)?.value||0);
      return {year:get('year'),month:get('month'),day:get('day')};
    };
    const findBoundary = (from, predicate, maxDays=400) => {
      for(let i=0;i<=maxDays;i++) {
        const candidate=new Date(from.getTime()-i*86400000);
        if(predicate(persianParts(candidate))) return candidate;
      }
      throw new Error('محاسبه بازه گزارش ناموفق بود');
    };
    let start,end;
    if(period==='week') {
      const daysSinceSaturday=(currentDate.getUTCDay()+1)%7;
      end=new Date(currentDate.getTime()-daysSinceSaturday*86400000);
      start=new Date(end.getTime()-7*86400000);
    } else if(period==='month') {
      const thisMonth=findBoundary(currentDate,p=>p.day===1,35);
      end=thisMonth;
      start=findBoundary(new Date(thisMonth.getTime()-86400000),p=>p.day===1,35);
    } else {
      const thisYear=findBoundary(currentDate,p=>p.month===1&&p.day===1,370);
      end=thisYear;
      start=findBoundary(new Date(thisYear.getTime()-86400000),p=>p.month===1&&p.day===1,370);
    }
    const iso = dt => new Date(dt.getTime() - 210*60000).toISOString();
    return {start:iso(start),end:iso(end)};
  }
  async function loadReport(period=reportPeriod) {
    if (!isAdmin) return;
    setReportLoading(true);
    const range=getReportRange(period);
    let allRows=[], page=0, error=null;
    while(true) {
      const result=await supabase.from('movements').select('id,item_name,type,quantity,created_at')
        .gte('created_at',range.start).lt('created_at',range.end).order('created_at',{ascending:true}).range(page*1000,page*1000+999);
      if(result.error) { error=result.error; break; }
      const chunk=result.data||[]; allRows=allRows.concat(chunk);
      if(chunk.length<1000) break; page++;
    }
    setReportLoading(false);
    if(error) return Alert.alert('گزارش دریافت نشد',error.message);
    setReportRows(allRows);
  }
  async function exportReport() {
    if (!isAdmin) return;
    const label={week:'هفته گذشته',month:'ماه گذشته',year:'سال گذشته'}[reportPeriod];
    const rows=reportRows.map(x=>`<tr><td>${escapeHtml(x.item_name||'—')}</td><td>${escapeHtml(formatIranDateTime(x.created_at))}</td><td>${Number(x.quantity||0).toLocaleString('fa-IR')}</td><td>${x.type==='in'?'ورودی':'خروجی'}</td></tr>`).join('');
    const html=`<html lang="fa" dir="rtl"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:24px;color:#182A43}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd6df;padding:9px;text-align:right}th{background:#e5f3f0}</style><h2>گزارش انبار - ${label}</h2><p>تاریخ تهیه: ${formatIranDateTime(new Date().toISOString())}</p><table><thead><tr><th>نام محصول</th><th>تاریخ و ساعت</th><th>تعداد</th><th>نوع عملیات</th></tr></thead><tbody>${rows||'<tr><td colspan="4">رکوردی ثبت نشده است</td></tr>'}</tbody></table></html>`;
    try {
      const result=await Print.printToFileAsync({html});
      if(!result?.uri) throw new Error('فایل PDF ساخته نشد.');
      const pdfFile=new File(result.uri);
      if(!pdfFile.exists) throw new Error('فایل PDF ساخته شد اما قابل خواندن نیست.');
      if(Platform.OS==='android') {
        let directoryUri=await AsyncStorage.getItem('junior-report-download-directory');
        if(!directoryUri) {
          const permission=await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if(!permission.granted) return;
          directoryUri=permission.directoryUri;
          await AsyncStorage.setItem('junior-report-download-directory',directoryUri);
        }
        try {
          const base64=await FileSystemLegacy.readAsStringAsync(pdfFile.uri,{encoding:FileSystemLegacy.EncodingType.Base64});
          const targetUri=await FileSystemLegacy.StorageAccessFramework.createFileAsync(directoryUri,`Junior-Storage-${Date.now()}.pdf`,'application/pdf');
          await FileSystemLegacy.writeAsStringAsync(targetUri,base64,{encoding:FileSystemLegacy.EncodingType.Base64});
        } catch(saveError) {
          await AsyncStorage.removeItem('junior-report-download-directory');
          throw new Error('ذخیره در پوشه انتخاب‌شده انجام نشد. دوباره گزارش را بزن و پوشه Downloads را انتخاب کن. '+(saveError.message||''));
        }
        Alert.alert('دانلود انجام شد','فایل PDF در پوشه‌ای که انتخاب کردی ذخیره شد.');
      } else if(await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfFile.uri,{mimeType:'application/pdf',dialogTitle:'گزارش انبار',UTI:'com.adobe.pdf'});
      } else if(await File.canPreview(pdfFile)) {
        await pdfFile.preview({title:'گزارش انبار'});
      } else {
        throw new Error('امکان ذخیره یا نمایش PDF در این دستگاه در دسترس نیست.');
      }
    } catch(e) { Alert.alert('ساخت یا دانلود PDF ناموفق بود',e.message||'خطای نامشخص'); }
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function loadContact() {
    const {data,error}=await supabase.from('app_settings').select('value').eq('key','contact').maybeSingle();
    if(!error && data?.value) { setContact(data.value); setContactDraft(data.value); }
  }
  async function saveContact() {
    const {error}=await supabase.from('app_settings').upsert({key:'contact',value:contactDraft,updated_by:session.user.id});
    if(error) return Alert.alert('ذخیره نشد',error.message);
    setContact(contactDraft); Alert.alert('ذخیره شد','اطلاعات ارتباط با ما به‌روزرسانی شد.');
  }
  async function loadUsers() {
    if(!isAdmin || !supabase) return;
    setUsersLoading(true);
    try {
      const {data,error}=await supabase.from('profiles').select('id,username,display_name,role,permissions,created_at').order('created_at',{ascending:true});
      if(error) throw error;
      setUsers(data||[]);
    } catch(e) { Alert.alert('به‌روزرسانی فهرست ناموفق',e.message||'دریافت کاربران انجام نشد.'); }
    finally { setUsersLoading(false); }
  }
  async function createUser() {
    if(!isAdmin) return;
    if(!userUsername.trim()||userPassword.length<8) return Alert.alert('اطلاعات ناقص','نام کاربری و رمز حداقل ۸ کاراکتری وارد کنید.');
    setBusy(true);
    const {data:{session:current}}=await supabase.auth.getSession();
    const {data,error}=await supabase.functions.invoke('admin-create-user',{body:{username:userUsername.trim().toLowerCase(),password:userPassword,display_name:userName.trim(),role:'staff',permissions} ,headers:{Authorization:`Bearer ${current?.access_token||''}`}});
    setBusy(false);
    if(error) return Alert.alert('ساخت کاربر ناموفق',error.message);
    setUserUsername('');setUserPassword('');setUserName('');setRoleMenuOpen(false);setPermissions({view_stock:true,record_in:false,record_out:false,manage_products:false});await loadUsers();Alert.alert('کاربر ساخته شد','نام کاربری: '+(data?.username||userUsername.trim()));
  }
  async function startEditUser(user) { setEditingUserId(user.id); setEditUsername(user.username||''); setEditPassword(''); }
  async function saveUserAccount(user) {
    if(!isAdmin || user.id===session.user.id) return;
    const username=editUsername.trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(username)) return Alert.alert('نام کاربری نامعتبر','نام کاربری باید ۳ تا ۳۰ کاراکتر و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.');
    if(editPassword && editPassword.length<8) return Alert.alert('رمز عبور نامعتبر','رمز عبور جدید باید حداقل ۸ کاراکتر باشد.');
    setEditUserBusy(true);
    try {
      const {data:{session:current}}=await supabase.auth.getSession();
      const {data,error}=await supabase.functions.invoke('admin-update-user',{body:{user_id:user.id,username,password:editPassword||undefined},headers:{Authorization:`Bearer ${current?.access_token||''}`}});
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      setEditingUserId(null);setEditPassword('');await loadUsers();Alert.alert('ذخیره شد','اطلاعات حساب کاربر به‌روزرسانی شد.');
    } catch(e) { Alert.alert('ویرایش حساب ناموفق',e.message||'خطا در ذخیره اطلاعات'); }
    finally { setEditUserBusy(false); }
  }
  async function updateUserRole(user,role) {
    if(!isAdmin || user.id===session.user.id) return;
    const {error}=await supabase.from('profiles').update({role,permissions:role==='staff'?user.permissions||{}:{}}).eq('id',user.id);
    if(error) Alert.alert('تغییر نقش ناموفق',error.message); else loadUsers();
  }
  async function updateUserPermission(user,key,value) {
    if(!isAdmin || user.id===session.user.id) return;
    const next={...(user.permissions||{}),[key]:value};
    if(value && ['record_in','record_out','manage_products'].includes(key)) next.view_stock=true;
    const {error}=await supabase.from('profiles').update({role:'staff',permissions:next}).eq('id',user.id);
    if(error) Alert.alert('تغییر دسترسی ناموفق',error.message); else loadUsers();
  }
  async function loadSettings() { await loadContact(); }

  useEffect(()=>{ if(session && profile) loadSettings(); },[session,profile]);
  useEffect(()=>{ if(tab==='admin' && isAdmin) loadUsers(); },[tab,isAdmin]);
  useEffect(()=>{ AsyncStorage.getItem('junior-theme').then(v=>{if(v){try{const x=JSON.parse(v);setDarkMode(!!x.darkMode);setPalette(x.palette||'teal');}catch{}}}); },[]);
  useEffect(()=>{ AsyncStorage.setItem('junior-theme',JSON.stringify({darkMode,palette})).catch(()=>{}); },[darkMode,palette]);

  const filtered = useMemo(() => items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),[items,search]);
  const total = items.reduce((n,i)=>n+Number(i.quantity||0),0);

  if (!configured) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/>
    <ScrollView contentContainerStyle={s.centerPage}>
      <Text style={s.logo}>JUNIOR STORAGE</Text><Text style={[s.heading,{color:activeColors.ink}]}>اتصال دیتابیس لازم است</Text>
      <Text style={[s.info,{color:activeColors.muted}]}>پروژه و رابط کاربری ساخته شده‌اند. برای فعال‌شدن ورود چندکاربره، ابتدا پروژه Supabase بسازید، سپس مقدار EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY را در فایل .env وارد کنید. فایل database.sql کنار پروژه ساخته می‌شود.</Text>
      <Text style={[s.sub,{color:activeColors.muted}]}>پس از تنظیم فایل، برنامه را با دستور npx expo start -c دوباره اجرا کنید.</Text>
    </ScrollView></SafeAreaView>;

  if (!session) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.centerPage}>
      <Text style={s.logo}>JUNIOR STORAGE</Text><Text style={[s.heading,{color:activeColors.ink}]}>مدیریت انبار کارخانه</Text>
      <Text style={[s.sub,{color:activeColors.muted}]}>برای ورود، حساب کاربری مجاز خود را وارد کنید.</Text>
      <Field value={username} onChangeText={setUsername} placeholder="نام کاربری"/>
      <Field value={password} onChangeText={setPassword} placeholder="رمز عبور" secureTextEntry/>
      <Btn title={busy?'لطفاً صبر کنید':'ورود به برنامه'} onPress={login} disabled={busy}/>
      <Text style={s.tiny}>ساخت حساب کاربری فقط از طریق مدیر سیستم انجام می‌شود.</Text>
    </KeyboardAvoidingView></SafeAreaView>;

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:80}} color={C.blue}/></SafeAreaView>;

  const title = ({stock:'آمار فعلی',in:'ورودی',out:'خروجی',hin:'تاریخچه ورودی',hout:'تاریخچه خروجی',reports:'گزارش و فاکتور',admin:'مدیریت کاربران',settings:'تنظیمات',contact:'ارتباط با ما',profile:'حساب کاربری'})[tab] || 'Junior Storage';
  const historyType = tab === 'hin' ? 'in' : 'out';
  const shownHistory = groupHistoryByDay(history, historyType);

  return <SafeAreaView style={[s.safe,{backgroundColor:activeColors.bg}]}><StatusBar barStyle={darkMode?'light-content':'dark-content'} translucent={true} backgroundColor={activeColors.card}/>
    <View style={[s.topbar,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><View style={s.topbarTitle}><Text style={s.brand} numberOfLines={1} adjustsFontSizeToFit>JUNIOR STORAGE</Text><Text style={[s.sub,{color:activeColors.muted}]} numberOfLines={1}>مدیریت انبار کارخانه</Text></View>
      <TouchableOpacity onPress={logout} hitSlop={{top:10,bottom:10,left:10,right:10}} style={s.logoutButton}><Text style={s.logout}>خروج</Text></TouchableOpacity></View>
    <View style={[s.content,{backgroundColor:activeColors.bg}]}>
      <View style={s.pageTitleRow}>{(tab!=='stock') && <TouchableOpacity onPress={()=>{if(tab==='admin'&&selectedUserId){setSelectedUserId(null);setEditPassword('');}else if(tab==='profile'||tab==='contact'){setTab('settings');}else{setTab('stock');setSelectedUserId(null);}}} style={{paddingHorizontal:12,paddingVertical:6}}><Text style={{fontSize:26,fontWeight:'900',color:activeColors.blue}}>‹</Text></TouchableOpacity>}<Text style={[s.heading,{color:activeColors.ink,flex:1}]}>{tab==='admin'&&selectedUserId?'جزئیات و دسترسی کاربر':title}</Text><Text style={s.role}>{isAdmin?'مدیر':profile?.role==='staff'?'کاربر عادی':'مشاهده‌گر'}</Text></View>
      {tab==='stock' && can('view_stock') && <ScrollView>
        <View style={[s.summary,{backgroundColor:darkMode?'#263B4D':'#101D2C'}]}><Text style={s.summaryLabel}>مجموع تعداد موجودی</Text><Text style={s.summaryNum}>{total.toLocaleString('fa-IR')}</Text><Text style={s.summaryFoot}>{items.length.toLocaleString('fa-IR')} نوع محصول</Text></View>
        <Field value={search} onChangeText={setSearch} placeholder="جست‌وجوی نام محصول..."/>
        {can('manage_products') && <View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>افزودن محصول جدید</Text><Field value={newName} onChangeText={setNewName} placeholder="نام محصول"/>
          <Field value={newPackaging} onChangeText={setNewPackaging} placeholder="نوع بسته‌بندی (مثلاً کارتن، گونی، جعبه)"/>
          <Field value={newDescription} onChangeText={setNewDescription} placeholder="توضیحات محصول (اختیاری)" multiline/>
          <Btn title="افزودن به انبار" onPress={addItem} disabled={busy}/></View>}
        {filtered.length===0 ? <Empty text="محصولی ثبت نشده است."/> : filtered.map(i=><View key={i.id} style={[s.productCard,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}>
          {editingItemId===i.id ? <View style={s.editProductBox}>
            <Field value={editingItemName} onChangeText={setEditingItemName} placeholder="نام محصول جدید"/>
            <Field value={editingPackaging} onChangeText={setEditingPackaging} placeholder="نوع بسته‌بندی (کارتن، گونی، جعبه...)"/>
            <Field value={editingDescription} onChangeText={setEditingDescription} placeholder="توضیحات محصول" multiline/>
            <View style={s.actionRow}><Btn title="ذخیره" onPress={saveItemEdit} disabled={busy} small/><Btn title="انصراف" kind="light" onPress={()=>{setEditingItemId(null);setEditingItemName('');}} small/></View>
          </View> : <>
            <View style={s.productInfo}><View style={{flex:1}}><Text style={[s.itemName,{color:activeColors.ink}]}>{i.name}</Text>{i.description ? <Text style={[s.sub,{color:activeColors.muted}]}>{i.description}</Text> : null}<Text style={[s.sub,{color:activeColors.muted}]}>بسته‌بندی: {i.packaging_type || '—'}</Text></View><Text style={[s.qty,{color:activeColors.ink}]}>{Number(i.quantity).toLocaleString('fa-IR')}</Text></View>
            {can('manage_products') && <View style={s.actionRow}><Btn title="ویرایش" kind="light" onPress={()=>startEditItem(i)} disabled={busy} small/><Btn title="حذف" kind="danger" onPress={()=>confirmDeleteItem(i)} disabled={busy} small/></View>}
          </>}
        </View>)}
      </ScrollView>}
      {(tab==='in'||tab==='out') && (can(tab==='in'?'record_in':'record_out')) && <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[s.info,{color:activeColors.muted}]}>{tab==='in'?'تعداد ورودی هر محصول را وارد کنید.':'تعداد خروجی هر محصول را وارد کنید. موجودی کافی بررسی می‌شود.'}</Text>
        {items.length===0 ? <Empty text="ابتدا مدیر باید محصولات را در بخش آمار فعلی اضافه کند."/> :
          items.map(i=><View key={i.id} style={s.qtyRow}><View style={{flex:1}}><Text style={[s.itemName,{color:activeColors.ink}]}>{i.name}</Text><Text style={[s.sub,{color:activeColors.muted}]}>موجودی: {Number(i.quantity).toLocaleString('fa-IR')}</Text></View>
            <Field value={String(quantities[i.id]??'')} onChangeText={v=>setQuantities(q=>({...q,[i.id]:v.replace(/[^0-9]/g,'')}))}
              placeholder="۰" keyboardType="number-pad" style={s.qtyInput}/></View>)}
        {items.length>0 && <Btn title={busy?'در حال ثبت...':tab==='in'?'ثبت همه ورودی‌ها':'ثبت همه خروجی‌ها'} onPress={()=>submitMovement(tab)} disabled={!can(tab==='in'?'record_in':'record_out')||busy}/>}
        {!can(tab==='in'?'record_in':'record_out') && <Text style={s.tiny}>برای حساب شما مجوز ثبت این عملیات فعال نیست.</Text>}
      </ScrollView>}
      {(tab==='hin'||tab==='hout') && <View style={{flex:1}}>
        {isAdmin && <Btn title={busy?'در حال حذف...':'حذف همه تاریخچه'} kind="danger"
          onPress={()=>confirmDeleteAllMovements(historyType)} disabled={busy || shownHistory.length===0}/>}
        <FlatList data={shownHistory} keyExtractor={day=>day.key}
          ListEmptyComponent={<Empty text="هنوز سابقه‌ای ثبت نشده است."/>}
          renderItem={({item:day})=><View style={[s.dailyCard,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}>
            <View style={s.dailyHeader}>
              <Text style={[s.dailyDate,{color:activeColors.ink}]}>{formatIranDay(day.date)}</Text>
              <Text style={s.dailyTotal}>{day.entries.length.toLocaleString('fa-IR')} رکورد</Text>
            </View>
            {day.entries.map(entry=><View key={entry.id} style={s.historyRow}>
              <View style={{flex:1,minWidth:0}}>
                <Text style={[s.itemName,{color:activeColors.ink}]}>{entry.item_name || 'محصول بدون نام'}</Text>
                <Text style={[s.sub,{color:activeColors.muted}]}>{formatIranDateTime(entry.created_at)}</Text>
              </View>
              <Text style={[s.qty,{color:historyType==='in'?C.green:C.red}]}>{historyType==='in'?'+':'−'}{Number(entry.quantity).toLocaleString('fa-IR')}</Text>
              {isAdmin && <Btn title="حذف" kind="danger" small onPress={()=>confirmDeleteMovement(entry)} disabled={busy}/>}
            </View>)}
          </View>}/>
      </View>}
      {tab==='reports' && isAdmin && <ScrollView>
        <Text style={[s.info,{color:activeColors.muted}]}>گزارش‌ها به‌صورت جداگانه برای بازه کامل قبلی تهیه می‌شوند.</Text>
        <View style={s.actionRow}>{[['week','هفته گذشته'],['month','ماه گذشته'],['year','سال گذشته']].map(([v,l])=><Btn key={v} title={l} kind={reportPeriod===v?'primary':'light'} small onPress={()=>{setReportPeriod(v);loadReport(v);}}/>)}</View>
        <Btn title={reportLoading?'در حال دریافت...':'نمایش گزارش'} onPress={()=>loadReport()} disabled={reportLoading}/>
        <Text style={[s.cardTitle,{color:activeColors.ink}]}>تعداد رکوردها: {reportRows.length.toLocaleString('fa-IR')}</Text>
        {reportRows.map(r=><View key={r.id} style={s.historyRow}><View style={{flex:1}}><Text style={[s.itemName,{color:activeColors.ink}]}>{r.item_name||'محصول'}</Text><Text style={[s.sub,{color:activeColors.muted}]}>{formatIranDateTime(r.created_at)} · {r.type==='in'?'ورودی':'خروجی'}</Text></View><Text style={[s.qty,{color:activeColors.ink}]}>{Number(r.quantity).toLocaleString('fa-IR')}</Text></View>)}
        <Btn title="دانلود PDF" onPress={exportReport} disabled={reportLoading}/>
      </ScrollView>}
      {tab==='admin' && isAdmin && <ScrollView keyboardShouldPersistTaps="handled">
        {selectedUserId ? (()=>{const u=users.find(x=>x.id===selectedUserId);if(!u)return <Empty text="کاربر پیدا نشد."/>;return <View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}>
          <Text style={[s.cardTitle,{color:activeColors.ink}]}>مدیریت کاربر: {u.display_name||u.username}</Text>
          <Text style={[s.cardTitle,{color:activeColors.ink,marginTop:14}]}>تعیین دسترسی‌ها</Text>
          {[['view_stock','مشاهده موجودی'],['record_in','ثبت ورودی'],['record_out','ثبت خروجی'],['manage_products','مدیریت محصولات']].map(([k,l])=><View key={k} style={s.settingRow}><Text style={[s.itemName,{color:activeColors.ink}]}>{l}</Text><Switch value={u.role==='viewer' ? k==='view_stock' : !!u.permissions?.[k]} onValueChange={v=>updateUserPermission(u,k,v)}/></View>)}
          <Text style={[s.cardTitle,{color:activeColors.ink,marginTop:18}]}>اطلاعات ورود</Text>
          <Field value={editUsername} onChangeText={setEditUsername} placeholder="نام کاربری جدید"/>
          <Field value={editPassword} onChangeText={setEditPassword} placeholder="رمز عبور جدید (خالی = بدون تغییر)" secureTextEntry/>
          <Btn title={editUserBusy?'در حال ذخیره...':'ذخیره تغییرات'} onPress={()=>saveUserAccount(u)} disabled={editUserBusy}/>
        </View>})() : <>
          <View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>افزودن کاربر جدید</Text>
            <Field value={userName} onChangeText={setUserName} placeholder="نام نمایشی"/><Field value={userUsername} onChangeText={setUserUsername} placeholder="نام کاربری (انگلیسی)"/><Field value={userPassword} onChangeText={setUserPassword} placeholder="رمز عبور (حداقل ۸ کاراکتر)" secureTextEntry/>
            <View style={[s.actionRow,{alignItems:'center'}]}><Text style={[s.sub,{color:activeColors.muted,flex:1}]}>برای تعیین دسترسی‌ها فلش را بزن</Text><Btn title={roleMenuOpen?'⌃':'⌄'} kind="light" small onPress={()=>setRoleMenuOpen(v=>!v)}/></View>
            {roleMenuOpen && [['view_stock','مشاهده موجودی'],['record_in','ثبت ورودی'],['record_out','ثبت خروجی'],['manage_products','مدیریت محصولات']].map(([k,l])=><View key={k} style={s.settingRow}><Text style={[s.itemName,{color:activeColors.ink}]}>{l}</Text><Switch value={!!permissions[k]} onValueChange={v=>setPermissions(p=>({...p,[k]:v,...(v&&['record_in','record_out','manage_products'].includes(k)?{view_stock:true}:{})}))}/></View>)}
            <Btn title={busy?'در حال ساخت...':'ساخت حساب کاربری'} onPress={createUser} disabled={busy}/>
          </View>
          <View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>کاربران ثبت‌شده</Text><Btn title={usersLoading?'در حال دریافت...':'به‌روزرسانی فهرست'} kind="light" onPress={loadUsers} disabled={usersLoading}/>
            {users.map(u=><TouchableOpacity key={u.id} onPress={()=>{setSelectedUserId(u.id);setEditUsername(u.username||'');setEditPassword('');}} style={[s.userRow,{paddingVertical:12,borderBottomWidth:1,borderColor:activeColors.line}]}><View style={{flex:1}}><Text style={[s.itemName,{color:activeColors.ink}]}>{u.display_name||u.username||u.id}</Text><Text style={[s.sub,{color:activeColors.muted}]}>نام کاربری: {u.username||'ثبت نشده'}</Text><Text style={[s.sub,{color:activeColors.muted}]}>نقش: {u.role==='admin'?'مدیر':u.role==='staff'?'کاربر عادی':'مشاهده‌گر'}</Text></View><Text style={{fontSize:22,color:activeColors.blue}}>‹</Text></TouchableOpacity>)}
          </View>
        </>}
      </ScrollView>}
      {tab==='settings' && <ScrollView><View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>نمایش برنامه</Text><View style={s.settingRow}><Text style={[s.itemName,{color:activeColors.ink}]}>حالت تیره</Text><Switch value={darkMode} onValueChange={setDarkMode}/></View><Text style={[s.sub,{color:activeColors.muted}]}>رنگ‌بندی</Text><View style={s.actionRow}><Btn title="سبزآبی" kind={palette==='teal'?'primary':'light'} small onPress={()=>setPalette('teal')}/><Btn title="آبی" kind={palette==='blue'?'primary':'light'} small onPress={()=>setPalette('blue')}/><Btn title="بنفش" kind={palette==='purple'?'primary':'light'} small onPress={()=>setPalette('purple')}/></View></View>
        <View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>حساب کاربری</Text><Btn title="مشاهده اطلاعات حساب" kind="light" onPress={()=>setTab('profile')}/><Btn title="ارتباط با ما" kind="light" onPress={()=>setTab('contact')}/><Btn title="اشتراک‌گذاری برنامه" onPress={()=>Share.share({message:'Junior Storage - برنامه مدیریت انبار'})}/></View>
      </ScrollView>}
      {tab==='profile' && <ScrollView><View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>اطلاعات حساب</Text><Text style={[s.info,{color:activeColors.muted}]}>نام: {profileInfo?.display_name||'—'}</Text><Text style={[s.info,{color:activeColors.muted}]}>ایمیل: {profileInfo?.email||'—'}</Text><Text style={[s.info,{color:activeColors.muted}]}>شناسه: {profileInfo?.id||'—'}</Text><Text style={[s.info,{color:activeColors.muted}]}>نقش: {profile?.role||'—'}</Text></View></ScrollView>}
      {tab==='contact' && <ScrollView><View style={[s.card,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}><Text style={[s.cardTitle,{color:activeColors.ink}]}>ارتباط با ما</Text>
        {isAdmin ? <><Field value={contactDraft.title} onChangeText={v=>setContactDraft(c=>({...c,title:v}))} placeholder="عنوان"/><Field value={contactDraft.phone} onChangeText={v=>setContactDraft(c=>({...c,phone:v}))} placeholder="شماره تماس" keyboardType="phone-pad"/><Field value={contactDraft.email} onChangeText={v=>setContactDraft(c=>({...c,email:v}))} placeholder="ایمیل"/><Field value={contactDraft.description} onChangeText={v=>setContactDraft(c=>({...c,description:v}))} placeholder="توضیحات"/><Btn title="ذخیره اطلاعات تماس" onPress={saveContact}/></> : <><Text style={[s.info,{color:activeColors.muted}]}>{contact.description||'برای اطلاعات بیشتر از راه‌های زیر با ما در ارتباط باشید.'}</Text><Text style={[s.info,{color:activeColors.muted}]}>تلفن: {contact.phone||'ثبت نشده'}</Text><Text style={[s.info,{color:activeColors.muted}]}>ایمیل: {contact.email||'ثبت نشده'}</Text></>}
      </View></ScrollView>}
    </View>
    <View style={[s.nav,{backgroundColor:activeColors.card,borderColor:activeColors.line}]}>{[...(can('view_stock')?[['stock','آمار','▦']]:[]),...(can('record_in')?[['in','ورودی','＋']]:[]),...(can('record_out')?[['out','خروجی','－']]:[]),...(can('view_stock')?[['hin','تاریخچه ورودی','↙'],['hout','تاریخچه خروجی','↗']]:[]),['settings','تنظیمات','⚙'],...(isAdmin?[['reports','گزارش','▤'],['admin','مدیریت','♙']]:[])].map(([id,label,ico])=>
      <TouchableOpacity key={id} onPress={()=>{setTab(id);setSearch('');if(id==='reports')loadReport();if(id==='admin')loadUsers();}} style={[s.navItem,tab===id&&s.navActive]}>
        <Text style={[s.navIcon,tab===id&&{color:C.blue}]}>{ico}</Text><Text style={[s.navText,tab===id&&{color:C.blue,fontWeight:'800'}]}>{label}</Text>
      </TouchableOpacity>)}</View>
  </SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg,paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||24):0}, centerPage:{flexGrow:1,justifyContent:'center',padding:24,gap:14},
 logo:{fontSize:15,fontWeight:'900',letterSpacing:2,color:C.blue,textAlign:'center',marginBottom:8},
 heading:{fontSize:20,fontWeight:'900',color:C.ink,textAlign:'right',flexShrink:1},
 sub:{fontSize:12,color:C.muted,textAlign:'right',marginTop:4},
 info:{fontSize:13,color:C.muted,textAlign:'right',lineHeight:22,marginVertical:10},
 tiny:{fontSize:11,color:C.muted,textAlign:'center',marginTop:12},
 input:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:C.line,borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:14,color:C.ink,textAlign:'right',marginVertical:5},
 btn:{backgroundColor:C.blue,borderRadius:12,padding:14,alignItems:'center',marginVertical:8},
 btnLight:{backgroundColor:C.pale},btnDanger:{backgroundColor:C.red},
 btnText:{color:'#FFFFFF',fontWeight:'800',fontSize:14},
 topbar:{paddingHorizontal:12,paddingVertical:7,minHeight:54,backgroundColor:C.card,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderColor:C.line},
 topbarTitle:{flex:1,minWidth:0,paddingRight:8},
 brand:{fontSize:10,fontWeight:'900',letterSpacing:1,color:C.blue,flexShrink:1},
 logoutButton:{minWidth:48,minHeight:40,alignItems:'center',justifyContent:'center',flexShrink:0},
 logout:{color:C.red,fontWeight:'800',paddingHorizontal:8,paddingVertical:6,fontSize:13},
 content:{flex:1,minWidth:0,paddingHorizontal:12,paddingTop:10},
 pageTitleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:9},
 role:{backgroundColor:C.pale,color:C.blue,paddingHorizontal:10,paddingVertical:6,borderRadius:20,fontSize:11,fontWeight:'800'},
 summary:{backgroundColor:'#101D2C',borderRadius:18,padding:18,marginBottom:12},
 summaryLabel:{color:'#B8D8D5',textAlign:'right',fontSize:12},
 summaryNum:{color:'#FFFFFF',fontSize:34,fontWeight:'900',textAlign:'right',marginTop:6},
 summaryFoot:{color:'#B8D8D5',textAlign:'right',fontSize:11,marginTop:4},
 card:{backgroundColor:C.card,borderRadius:14,padding:12,marginVertical:10,borderWidth:1,borderColor:C.line},
 cardTitle:{fontWeight:'900',color:C.ink,textAlign:'right',marginBottom:5},
 itemRow:{backgroundColor:C.card,borderRadius:12,padding:15,marginVertical:4,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:C.line},
 productCard:{backgroundColor:C.card,borderRadius:12,padding:11,marginVertical:4,borderWidth:1,borderColor:C.line},
 productInfo:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
 editProductBox:{width:'100%'},
 actionRow:{flexDirection:'row',justifyContent:'flex-start',alignItems:'center',flexWrap:'wrap',gap:7,marginTop:6},
 itemName:{fontSize:14,fontWeight:'700',color:C.ink,textAlign:'right',flexShrink:1},
 qty:{fontSize:16,fontWeight:'900',color:C.ink,marginLeft:12},
 qtyRow:{backgroundColor:C.card,borderRadius:12,padding:10,marginVertical:4,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line},
 qtyInput:{width:82,textAlign:'center',marginVertical:0},
 historyRow:{backgroundColor:C.card,borderRadius:12,padding:14,marginVertical:4,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line},
 dailyCard:{backgroundColor:C.card,borderRadius:14,padding:12,marginBottom:12,borderWidth:1,borderColor:C.line},
 dailyDay:{borderTopWidth:1,borderTopColor:C.line,paddingTop:9,marginTop:8},
 dailyHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:5,flexWrap:'wrap'},
 dailyDate:{fontSize:13,fontWeight:'900',color:C.ink},
 dailyTotal:{fontSize:12,fontWeight:'900'},
 dailyProduct:{flexDirection:'row',justifyContent:'space-between',paddingVertical:5},
 dailyName:{fontSize:13,color:C.ink,flex:1,textAlign:'right'},
 dailyQty:{fontSize:13,fontWeight:'800',marginLeft:10},
 dailyEmpty:{fontSize:12,color:C.muted,textAlign:'right',paddingVertical:8},
 empty:{padding:30,alignItems:'center'},emptyText:{color:C.muted,textAlign:'center'},
 nav:{flexDirection:'row',backgroundColor:C.card,borderTopWidth:1,borderColor:C.line,paddingHorizontal:3,paddingTop:5,paddingBottom:Platform.OS==='android'?9:18},
 navItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',paddingVertical:6,paddingHorizontal:1},
 navActive:{backgroundColor:C.pale,borderRadius:10,marginHorizontal:2},
 navIcon:{fontSize:15,color:C.muted,fontWeight:'900'},
 navText:{fontSize:8,color:C.muted,marginTop:2,textAlign:'center',flexShrink:1},
 settingRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderColor:C.line},
 userRow:{paddingVertical:10,borderBottomWidth:1,borderColor:C.line}
});