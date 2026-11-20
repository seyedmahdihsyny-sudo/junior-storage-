import 'react-native-url-polyfill/auto';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const configured = URL.startsWith('https://') && KEY.length > 20;
const supabase = configured ? createClient(URL, KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
}) : null;

const C = {
  bg:'#F1F8F7', card:'#FFFFFF', ink:'#14283A', muted:'#647985', blue:'#18B9A8',
  pale:'#DDF7F2', green:'#138B78', red:'#D64545', line:'#DCEAE7', amber:'#C99F3D'
};

function Btn({ title, onPress, kind='primary', disabled=false, small=false }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress}
    style={[s.btn, kind==='light' && s.btnLight, kind==='danger' && s.btnDanger,
      disabled && {opacity:.45}, small && {paddingVertical:8,paddingHorizontal:12}]}>
    <Text style={[s.btnText, kind==='light' && {color:C.blue}, small && {fontSize:12}]}>{title}</Text>
  </TouchableOpacity>;
}
function Field({ value, onChangeText, placeholder, keyboardType='default', secureTextEntry=false, style }) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor="#9AA6B2" keyboardType={keyboardType} secureTextEntry={secureTextEntry}
    style={[s.input, style]} />;
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
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [newName,setNewName] = useState('');
  const [editingItemId,setEditingItemId] = useState(null);
  const [editingItemName,setEditingItemName] = useState('');
  const [quantities,setQuantities] = useState({});
  const [search,setSearch] = useState('');

  const isAdmin = profile?.role === 'admin';

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
          .select('id, role, display_name')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          throw new Error(
            profileError.code === 'PGRST116'
              ? 'برای این حساب در جدول profiles پروفایل پیدا نشد.'
              : profileError.message
          );
        }

        if (!p || !['admin', 'viewer'].includes(p.role)) {
          throw new Error('نقش حساب معتبر نیست. مقدار role باید admin یا viewer باشد.');
        }

        if (!alive) return;
        setProfile(p);

        const [inventoryResult, movementResult] = await Promise.all([
          supabase.from('inventory').select('*').order('name'),
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
        supabase.from('inventory').select('*').order('name'),
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
      supabase.from('inventory').select('*').order('name'),
      supabase.from('movements').select('*').order('created_at',{ascending:false}).limit(300)
    ]);
    if (!a.error) setItems(a.data || []);
    if (!b.error) setHistory(b.data || []);
  }

  async function login() {
    if (!configured) return Alert.alert('اتصال تنظیم نشده','ابتدا آدرس و کلید Supabase را در فایل .env وارد کنید و برنامه را دوباره اجرا کنید.');
    if (!email.trim() || !password) return Alert.alert('ورودی ناقص','ایمیل و رمز عبور را وارد کنید.');
    setBusy(true);
    const {error} = await supabase.auth.signInWithPassword({email:email.trim(),password});
    setBusy(false);
    if (error) Alert.alert('ورود ناموفق',error.message);
  }
  async function logout() { await supabase.auth.signOut(); setPassword(''); }
  async function addItem() {
    const name = newName.trim();
    if (!name) return Alert.alert('نام محصول را وارد کنید');
    setBusy(true);
    const {error} = await supabase.from('inventory').insert({name,quantity:0});
    setBusy(false);
    if (error) Alert.alert('خطا',error.message);
    else { setNewName(''); refresh(); }
  }
  function startEditItem(item) {
    setEditingItemId(item.id);
    setEditingItemName(item.name || '');
  }
  async function saveItemEdit() {
    const name = editingItemName.trim();
    if (!name) return Alert.alert('نام محصول را وارد کنید');
    setBusy(true);
    const {error} = await supabase.from('inventory').update({name}).eq('id',editingItemId);
    setBusy(false);
    if (error) Alert.alert('ویرایش انجام نشد',error.message);
    else { setEditingItemId(null); setEditingItemName(''); await refresh(); }
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

  const filtered = useMemo(() => items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),[items,search]);
  const total = items.reduce((n,i)=>n+Number(i.quantity||0),0);

  if (!configured) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/>
    <ScrollView contentContainerStyle={s.centerPage}>
      <Text style={s.logo}>JUNIOR STORAGE</Text><Text style={s.heading}>اتصال دیتابیس لازم است</Text>
      <Text style={s.info}>پروژه و رابط کاربری ساخته شده‌اند. برای فعال‌شدن ورود چندکاربره، ابتدا پروژه Supabase بسازید، سپس مقدار EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY را در فایل .env وارد کنید. فایل database.sql کنار پروژه ساخته می‌شود.</Text>
      <Text style={s.sub}>پس از تنظیم فایل، برنامه را با دستور npx expo start -c دوباره اجرا کنید.</Text>
    </ScrollView></SafeAreaView>;

  if (!session) return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={s.centerPage}>
      <Text style={s.logo}>JUNIOR STORAGE</Text><Text style={s.heading}>مدیریت انبار کارخانه</Text>
      <Text style={s.sub}>برای ورود، حساب کاربری مجاز خود را وارد کنید.</Text>
      <Field value={email} onChangeText={setEmail} placeholder="ایمیل" keyboardType="email-address"/>
      <Field value={password} onChangeText={setPassword} placeholder="رمز عبور" secureTextEntry/>
      <Btn title={busy?'لطفاً صبر کنید':'ورود به برنامه'} onPress={login} disabled={busy}/>
      <Text style={s.tiny}>ساخت حساب کاربری فقط از طریق مدیر سیستم انجام می‌شود.</Text>
    </KeyboardAvoidingView></SafeAreaView>;

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:80}} color={C.blue}/></SafeAreaView>;

  const title = ({stock:'آمار فعلی',in:'ورودی',out:'خروجی',hin:'تاریخچه ورودی',hout:'تاریخچه خروجی'})[tab];
  const historyType = tab === 'hin' ? 'in' : 'out';
  const shownHistory = groupHistoryByDay(history, historyType);

  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" translucent={true} backgroundColor={C.card}/>
    <View style={s.topbar}><View style={s.topbarTitle}><Text style={s.brand} numberOfLines={1} adjustsFontSizeToFit>JUNIOR STORAGE</Text><Text style={s.sub} numberOfLines={1}>مدیریت انبار کارخانه</Text></View>
      <TouchableOpacity onPress={logout} hitSlop={{top:10,bottom:10,left:10,right:10}} style={s.logoutButton}><Text style={s.logout}>خروج</Text></TouchableOpacity></View>
    <View style={s.content}>
      <View style={s.pageTitleRow}><Text style={s.heading}>{title}</Text><Text style={s.role}>{isAdmin?'مدیر':'مشاهده‌گر'}</Text></View>
      {tab==='stock' && <ScrollView>
        <View style={s.summary}><Text style={s.summaryLabel}>مجموع تعداد موجودی</Text><Text style={s.summaryNum}>{total.toLocaleString('fa-IR')}</Text><Text style={s.summaryFoot}>{items.length.toLocaleString('fa-IR')} نوع محصول</Text></View>
        <Field value={search} onChangeText={setSearch} placeholder="جست‌وجوی نام محصول..."/>
        {isAdmin && <View style={s.card}><Text style={s.cardTitle}>افزودن محصول جدید</Text><Field value={newName} onChangeText={setNewName} placeholder="نام محصول"/>
          <Btn title="افزودن به انبار" onPress={addItem} disabled={busy}/></View>}
        {filtered.length===0 ? <Empty text="محصولی ثبت نشده است."/> : filtered.map(i=><View key={i.id} style={s.productCard}>
          {editingItemId===i.id ? <View style={s.editProductBox}>
            <Field value={editingItemName} onChangeText={setEditingItemName} placeholder="نام محصول جدید"/>
            <View style={s.actionRow}><Btn title="ذخیره" onPress={saveItemEdit} disabled={busy} small/><Btn title="انصراف" kind="light" onPress={()=>{setEditingItemId(null);setEditingItemName('');}} small/></View>
          </View> : <>
            <View style={s.productInfo}><Text style={s.itemName}>{i.name}</Text><Text style={s.qty}>{Number(i.quantity).toLocaleString('fa-IR')}</Text></View>
            {isAdmin && <View style={s.actionRow}><Btn title="ویرایش" kind="light" onPress={()=>startEditItem(i)} disabled={busy} small/><Btn title="حذف" kind="danger" onPress={()=>confirmDeleteItem(i)} disabled={busy} small/></View>}
          </>}
        </View>)}
      </ScrollView>}
      {(tab==='in'||tab==='out') && <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={s.info}>{tab==='in'?'تعداد ورودی هر محصول را وارد کنید.':'تعداد خروجی هر محصول را وارد کنید. موجودی کافی بررسی می‌شود.'}</Text>
        {items.length===0 ? <Empty text="ابتدا مدیر باید محصولات را در بخش آمار فعلی اضافه کند."/> :
          items.map(i=><View key={i.id} style={s.qtyRow}><View style={{flex:1}}><Text style={s.itemName}>{i.name}</Text><Text style={s.sub}>موجودی: {Number(i.quantity).toLocaleString('fa-IR')}</Text></View>
            <Field value={String(quantities[i.id]??'')} onChangeText={v=>setQuantities(q=>({...q,[i.id]:v.replace(/[^0-9]/g,'')}))}
              placeholder="۰" keyboardType="number-pad" style={s.qtyInput}/></View>)}
        {items.length>0 && <Btn title={busy?'در حال ثبت...':tab==='in'?'ثبت همه ورودی‌ها':'ثبت همه خروجی‌ها'} onPress={()=>submitMovement(tab)} disabled={!isAdmin||busy}/>}
        {!isAdmin && <Text style={s.tiny}>فقط مدیر اجازه ثبت عملیات را دارد.</Text>}
      </ScrollView>}
      {(tab==='hin'||tab==='hout') && <View style={{flex:1}}>
        {isAdmin && <Btn title={busy?'در حال حذف...':'حذف همه تاریخچه'} kind="danger"
          onPress={()=>confirmDeleteAllMovements(historyType)} disabled={busy || shownHistory.length===0}/>}
        <FlatList data={shownHistory} keyExtractor={day=>day.key}
          ListEmptyComponent={<Empty text="هنوز سابقه‌ای ثبت نشده است."/>}
          renderItem={({item:day})=><View style={s.dailyCard}>
            <View style={s.dailyHeader}>
              <Text style={s.dailyDate}>{formatIranDay(day.date)}</Text>
              <Text style={s.dailyTotal}>{day.entries.length.toLocaleString('fa-IR')} رکورد</Text>
            </View>
            {day.entries.map(entry=><View key={entry.id} style={s.historyRow}>
              <View style={{flex:1,minWidth:0}}>
                <Text style={s.itemName}>{entry.item_name || 'محصول بدون نام'}</Text>
                <Text style={s.sub}>{formatIranDateTime(entry.created_at)}</Text>
              </View>
              <Text style={[s.qty,{color:historyType==='in'?C.green:C.red}]}>{historyType==='in'?'+':'−'}{Number(entry.quantity).toLocaleString('fa-IR')}</Text>
              {isAdmin && <Btn title="حذف" kind="danger" small onPress={()=>confirmDeleteMovement(entry)} disabled={busy}/>}
            </View>)}
          </View>}/>
      </View>}
    </View>
    <View style={s.nav}>{[['stock','آمار فعلی','▦'],['in','ورودی','＋'],['out','خروجی','－'],['hin','تاریخچه ورودی','↙'],['hout','تاریخچه خروجی','↗']].map(([id,label,ico])=>
      <TouchableOpacity key={id} onPress={()=>{setTab(id);setSearch('');}} style={[s.navItem,tab===id&&s.navActive]}>
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
 navText:{fontSize:8,color:C.muted,marginTop:2,textAlign:'center',flexShrink:1}
});
