import React, { useState, useEffect, useRef } from "react";
import { loadAll, saveCollection, COLLECTIONS } from "./supabase.js";

// ============================================================
// TRANSLOAD WMS v3 - DC Operations Portal
// Inbound / Outbound / History / Inventory Ledger / Activity Log
// + Customer Mgmt / Rate Card / Billing / Warehouses / Users
// ============================================================

// -- Colors -------------------------------------------------
const C = {
  bg:"#080f18", card:"#0e1a27", row:"#132030", input:"#1a2d40",
  border:"#1e3348", borderL:"#162840",
  amber:"#f59e0b", amberD:"#f59e0b1a", amberB:"#f59e0b44",
  teal:"#14b8a6",  tealD:"#14b8a61a",
  green:"#22c55e", greenD:"#22c55e1a",
  red:"#ef4444",   redD:"#ef44441a",
  blue:"#3b82f6",  blueD:"#3b82f61a",
  purple:"#a855f7",purpleD:"#a855f71a",
  orange:"#f97316",orangeD:"#f973161a",
  white:"#e2eaf4", muted:"#6b8299",
};

// -- Helpers ------------------------------------------------
const today = new Date();
const dAgo=(n)=>{ const d=new Date(today); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; };
const dFwd=(n)=>{ const d=new Date(today); d.setDate(d.getDate()+n); return d.toISOString().split("T")[0]; };
const fmtD=(s)=>s?new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"-";
const fmtDT=(d)=>d.toISOString().slice(0,16).replace("T"," ");
const aging=(d)=>d?Math.max(0,Math.floor((today-new Date(d+"T12:00:00"))/86400000)):0;
// inclusive day count between two YYYY-MM-DD dates (both endpoints counted)
const daysInclusive=(a,b)=>{ if(!a||!b)return 0; const da=new Date(a+"T12:00:00"), db=new Date(b+"T12:00:00"); return Math.max(0,Math.floor((db-da)/86400000)+1); };
// return the day before a given YYYY-MM-DD date
const dayBefore=(s)=>{ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()-1); return d.toISOString().split("T")[0]; };
const dayAfter=(s)=>{ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; };
const todayStr=()=>today.toISOString().split("T")[0];
const money=(n)=>"$"+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");
const num=(n)=>Number(n||0).toLocaleString("en-US");
let _id=1000; const uid=()=>String(++_id);

// -- Constants ----------------------------------------------
const CONTAINER_TYPES=["40HQ","40GP","20GP","45HQ","53FT","Loose Cargo","LCL","Other"];
const LOADING_TYPES=["F2F - Floor to Floor","F2P - Floor to Pallet","P2P - Pallet to Pallet","Full Container Storage"];
const STACKABLE=["Stackable","Non-Stackable"];
const BILLING_TERMS=["Net 15","Net 30","Net 45","Net 60","Due on receipt","Prepaid"];
const CUST_ST=["Active","Suspended","Disabled"];
const SHIP_MODES=["FTL","LTL","Parcel","LTL/Direct","Pickup"];

const emptyRC=()=>({freeDays:0,storagePerPallet:0,storagePerContainer:0,storagePerCarton:0,storagePerPiece:0,f2fUnload:0,f2fSort:0,f2fHandling:0,f2fReload:0,f2pUnload:0,f2pPalletize:0,f2pPallet:0,f2pWrap:0,f2pLabel:0,f2pAirbag:0,p2pForklift:0,p2pStorage:0,p2pLoading:0,p2pLabel:0,p2pAirbag:0,handlingFee:0,shippingFee:0});

// Returns true if the customer has an Active, non-expired quote sheet valid today
function hasValidRateSheet(customer){
  if(!customer)return false;
  const d=new Date().toISOString().split("T")[0];
  return (customer.quoteSheets||[]).some(q=>q.status==="Active"&&(!q.effectiveDate||q.effectiveDate<=d)&&(!q.expiryDate||q.expiryDate>=d));
}
// Returns the rate sheet covering a specific date (or null), regardless of status
function rateSheetCoveringDate(customer,dateStr){
  if(!customer||!dateStr)return null;
  return (customer.quoteSheets||[]).find(q=>(!q.effectiveDate||q.effectiveDate<=dateStr)&&(!q.expiryDate||q.expiryDate>=dateStr))||null;
}

// -- Seed: Warehouses ---------------------------------------
const INIT_WAREHOUSES=[
  {id:"WH001",code:"T2-NJY-51RA",name:"T2 Warehouse - Rahway",address:"51 Rahway Ave, Rahway, NJ",active:true},
  {id:"WH002",code:"T2-NJY-51SS",name:"T2 Warehouse - South St",address:"51 South St, Newark, NJ",active:true},
  {id:"WH003",code:"DERBY-01",name:"Derby Warehouse",address:"1234 Derby Rd, Los Angeles, CA",active:true},
];

// -- Seed: Customers (with projects/sub-accounts) -----------
const INIT_CUSTOMERS=[
  {id:"S2-CANBC001",name:"Canbest Logistics",contact:"David Chen",email:"david@canbest.com",phone:"+1 201-555-0101",
   address:"880 Port Newark Rd, Newark, NJ 07114",billingTerms:"Net 30",status:"Active",
   projects:["LEI Costco","LEI Walmart"],
   portalUser:"canbest",portalPass:"canbest123",
   quoteSheets:[{id:"qs1",quoteNo:"QT-2025-001",effectiveDate:dAgo(200),expiryDate:dFwd(165),status:"Active",
     rates:{...emptyRC(),freeDays:7,storagePerPallet:2.5,f2pUnload:120,f2pPalletize:15,f2pPallet:12,f2pWrap:8,handlingFee:20}}]},
  {id:"NY0029",name:"Nails You Wholesale",contact:"Maria Lopez",email:"maria@nailsyou.com",phone:"+1 732-555-0199",
   address:"29 Industrial Pkwy, Edison, NJ 08817",billingTerms:"Net 45",status:"Active",
   projects:["Retail Direct"],
   portalUser:"nailsyou",portalPass:"nails123",
   quoteSheets:[{id:"qs2",quoteNo:"QT-2025-002",effectiveDate:dAgo(120),expiryDate:dFwd(245),status:"Active",
     rates:{...emptyRC(),freeDays:14,storagePerPallet:3.0,p2pForklift:90,p2pLoading:70,handlingFee:25}}]},
];

// -- Seed: Carriers -----------------------------------------
const INIT_CARRIERS=[
  {id:"CR001",name:"Echo Freight",scac:"ECHO",contact:"",phone:"",active:true},
  {id:"CR002",name:"XPO Logistics",scac:"XPOL",contact:"",phone:"",active:true},
  {id:"CR003",name:"FedEx Freight",scac:"FXFE",contact:"",phone:"",active:true},
];

// -- Seed: Orders (unified inbound + outbound model) --------
// status flow: Submitted -> Scheduled -> Received (inbound) / Shipped (outbound)
const INIT_ORDERS=[
  // Inbound order, still pending
  {id:"O"+uid(),type:"IN",submitted:dAgo(2),eta:dFwd(3),etd:"",customerId:"S2-CANBC001",project:"LEI Costco",
   warehouseCode:"T2-NJY-51RA",containerNo:"CRXU4428037",cntrSize:"40HQ",loadingType:"F2P - Floor to Pallet",
   sku:"16A0607 PACK A",description:"BLACK / BLUE / PURPLE",plts:12,units:600,reference:"REF-90011",ttsPo:"T2-PO-5501",
   notes:"",status:"Submitted",shipMode:"",carrierId:"",docCount:0,
   confirmedDate:"",receivedDate:"",shippedDate:""},
];

// -- Seed: Inventory Ledger ---------------------------------
// Each ledger line = one received container/SKU with running balance.
// movements track partial-outs over time.
const INIT_LEDGER=[
  {id:"L"+uid(),customerId:"S2-CANBC001",project:"LEI Costco",warehouseCode:"T2-NJY-51RA",
   containerNo:"KQ002 - AIR",lot:"",sku:"16A0607 PACK A",description:"BLACK / BLUE / PURPLE",loadingType:"F2P - Floor to Pallet",
   ibDate:"2025-07-16",inPlts:6,inUnits:230,
   movements:[
     {date:"2026-06-11",outPlts:0,outUnits:72,ref:"1740608270"},
     {date:"2026-06-12",outPlts:0,outUnits:38,ref:"1740608269"},
     {date:"2026-06-12",outPlts:0,outUnits:52,ref:"1750608345"},
   ]},
  {id:"L"+uid(),customerId:"S2-CANBC001",project:"LEI Costco",warehouseCode:"T2-NJY-51RA",
   containerNo:"TLLU5877323",lot:"",sku:"16A0607 PACK A",description:"BLACK / BLUE / PURPLE",loadingType:"F2P - Floor to Pallet",
   ibDate:"2025-07-15",inPlts:24,inUnits:1035,
   movements:[
     {date:"2025-08-01",outPlts:0,outUnits:32,ref:"2620608331"},
     {date:"2026-06-09",outPlts:0,outUnits:64,ref:"2620608330"},
     {date:"2026-06-11",outPlts:0,outUnits:72,ref:"10520608275"},
   ]},
  {id:"L"+uid(),customerId:"NY0029",project:"Retail Direct",warehouseCode:"T2-NJY-51SS",
   containerNo:"ZCSU6682211",lot:"",sku:"ZCSU6682211 - nails",description:"Acrylic nail kits",loadingType:"Full Container Storage",
   ibDate:dAgo(20),inPlts:27,inUnits:0,
   movements:[]},
];

// -- Seed: Activity Log -------------------------------------
// Build historical activity from the seed ledger so old inventory has a record.
const INIT_ACTIVITY=(()=>{
  const rows=[];
  INIT_LEDGER.forEach(l=>{
    // inbound received event
    rows.push({ts:(l.ibDate||"")+" 09:00",action:"IN received",detail:l.containerNo+" · "+l.sku+" · "+l.inPlts+" plt / "+l.inUnits+" u",customerId:l.customerId,warehouseCode:l.warehouseCode,user:"system"});
    // each partial-out movement
    (l.movements||[]).forEach(m=>{
      rows.push({ts:(m.date||"")+" 14:00",action:"OUT shipped",detail:l.containerNo+" · "+l.sku+" · "+(m.outPlts||0)+" plt / "+(m.outUnits||0)+" u · ref "+(m.ref||"-"),customerId:l.customerId,warehouseCode:l.warehouseCode,user:"system"});
    });
  });
  // newest first
  return rows.sort((a,b)=>(b.ts||"").localeCompare(a.ts||""));
})();

// -- Seed: Invoices -----------------------------------------
const INIT_INVOICES=[];

// -- Seed: Users --------------------------------------------
// Sections that can be permission-controlled for staff/warehouse users
const ALL_SECTIONS=[
  {id:"dashboard",label:"Dashboard"},
  {id:"inbound",label:"Inbound"},
  {id:"outbound",label:"Outbound"},
  {id:"history",label:"History"},
  {id:"inventory",label:"Inventory"},
  {id:"activity",label:"Activity Log"},
  {id:"billing",label:"Billing"},
  {id:"customers",label:"Customers"},
  {id:"carriers",label:"Carriers"},
  {id:"warehouses",label:"Warehouses"},
];
// Access levels for each section
const ACCESS_LEVELS=[
  {id:"none",label:"No Access"},
  {id:"view",label:"View Only"},
  {id:"add",label:"Add Only"},
  {id:"addedit",label:"Add & Edit"},
  {id:"full",label:"Full Access"},
];
// helper: can the permission do X?
const canView=(lvl)=>lvl&&lvl!=="none";
const canAdd=(lvl)=>lvl==="add"||lvl==="addedit"||lvl==="full";
const canEdit=(lvl)=>lvl==="addedit"||lvl==="full";
const canDelete=(lvl)=>lvl==="full";

const INIT_USERS=[
  {id:"U001",username:"john",password:"john123",name:"John Lee",role:"staff",active:true,
   permissions:{dashboard:"view",inbound:"addedit",outbound:"addedit",history:"view",inventory:"view",activity:"view"},allowedWarehouses:[]},
  {id:"U002",username:"sara",password:"sara123",name:"Sara Kim",role:"staff",active:true,
   permissions:{dashboard:"view",inbound:"add",outbound:"add",history:"view",inventory:"view",activity:"view"},allowedWarehouses:[]},
  // Warehouse user: can only see their own location
  {id:"U004",username:"wh-rahway",password:"wh123",name:"Rahway Warehouse",role:"warehouse",active:true,
   permissions:{inbound:"addedit",outbound:"addedit",inventory:"view"},allowedWarehouses:["T2-NJY-51RA"]},
];

// ============================================================
// SHARED STYLES + UI PRIMITIVES
// ============================================================
const s={
  card: {background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"20px 24px"},
  input:{background:C.input,border:`1px solid ${C.border}`,color:C.white,borderRadius:6,padding:"8px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",colorScheme:"dark"},
  label:{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:4},
  th:   {textAlign:"left",padding:"10px 12px",fontSize:10,color:C.muted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"},
  td:   {padding:"10px 12px",borderBottom:`1px solid ${C.borderL}`,fontSize:12.5,color:C.white,verticalAlign:"middle"},
  sec:  {fontSize:11,fontWeight:800,color:C.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${C.border}`},
};

const TAGS={amber:[C.amberD,C.amber],teal:[C.tealD,C.teal],green:[C.greenD,C.green],red:[C.redD,C.red],blue:[C.blueD,C.blue],purple:[C.purpleD,C.purple],orange:[C.orangeD,C.orange],slate:["#1e334833",C.muted]};
function Tag({label,color="slate"}){
  const[bg,fg]=TAGS[color]||TAGS.slate;
  return (<span style={{background:bg,color:fg,border:"1px solid "+fg+"44",fontSize:10.5,fontWeight:700,letterSpacing:"0.05em",padding:"2px 8px",borderRadius:4,textTransform:"uppercase",whiteSpace:"nowrap",display:"inline-block"}}>{label}</span>);
}
// Short, color-coded label for a loading type
function ltTag(lt){
  const t=(lt||"").toLowerCase();
  if(t.includes("full container"))return <Tag label="Full Cntr" color="amber"/>;
  if(t.includes("f2f"))return <Tag label="F2F" color="blue"/>;
  if(t.includes("f2p"))return <Tag label="F2P" color="purple"/>;
  if(t.includes("p2p"))return <Tag label="P2P" color="teal"/>;
  return <span style={{color:"#64748b"}}>-</span>;
}
function stTag(st){
  const m={
    "Submitted":["blue","Submitted"],"Scheduled":["amber","Scheduled"],
    "Received":["green","Received"],"Shipped":["green","Shipped"],
    "Awaiting Confirm":["orange","Awaiting"],"Confirmed":["teal","Confirmed"],
    "In Storage":["amber","In Storage"],"Partially Out":["teal","Partial Out"],
    "Fully Out":["green","Fully Out"],"Active":["green","Active"],
    "Suspended":["orange","Suspended"],"Disabled":["slate","Disabled"],
    "Cancelled":["red","Cancelled"],"Invoiced":["purple","Invoiced"],
    "Paid":["green","Paid"],"Unpaid":["orange","Unpaid"],"Completed":["green","Completed"],
  };
  const[c,l]=m[st]||["slate",st];
  return (<Tag label={l} color={c}/>);
}
function F({label,htmlFor,children}){return (<div style={{display:"flex",flexDirection:"column"}}><label htmlFor={htmlFor} style={s.label}>{label}</label>{children}</div>);}
function TI({label,id,...p}){return (<F label={label||""} htmlFor={id}><input id={id} {...p} style={{...s.input,position:"relative",zIndex:1,...(p.style||{})}}/></F>);}
function TS({label,children,...p}){return (<F label={label||""}><select {...p} style={{...s.input,...(p.style||{})}}>{children}</select></F>);}
function TA({label,...p}){return (<F label={label||""}><textarea {...p} style={{...s.input,resize:"vertical",lineHeight:1.6,...(p.style||{})}}/></F>);}
function Btn({children,v="default",sm,...p}){
  const vs={primary:{background:C.amber,color:C.bg,border:`1px solid ${C.amber}`},success:{background:C.green,color:C.bg,border:`1px solid ${C.green}`},danger:{background:C.redD,color:C.red,border:`1px solid ${C.red}55`},default:{background:C.input,color:C.muted,border:`1px solid ${C.border}`},ghost:{background:"transparent",color:C.muted,border:`1px solid ${C.border}`}};
  const sz=sm?{padding:"5px 12px",fontSize:12}:{padding:"8px 18px",fontSize:13};
  return (<button {...p} style={{...vs[v],...sz,borderRadius:6,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",...(p.style||{})}}>{children}</button>);
}
function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{...s.card,width:wide?900:580,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontWeight:800,fontSize:16,color:C.white}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:22,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function KPI({label,value,sub,color,active,onClick}){
  return(
    <div onClick={onClick} style={{...s.card,padding:"16px 20px",cursor:onClick?"pointer":"default",borderColor:active?C.amber:C.border,minWidth:150,flex:"1 1 0"}}>
      <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontSize:26,fontWeight:800,color:color||C.white,fontFamily:"monospace",lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.muted,marginTop:5}}>{sub}</div>}
    </div>
  );
}

// CSV export helper
function exportCSV(filename, rows){
  if(!rows.length){alert("Nothing to export.");return;}
  const headers=Object.keys(rows[0]);
  const escape=(v)=>{ const str=String(v==null?"":v); return /[",\n]/.test(str)?'"'+str.replace(/"/g,'""')+'"':str; };
  const csv=[headers.join(","),...rows.map(r=>headers.map(h=>escape(r[h])).join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

// Export to Excel (.xls) using an HTML table Excel can open natively
function exportExcel(filename, sheetName, rows){
  if(!rows.length){alert("Nothing to export.");return;}
  const headers=Object.keys(rows[0]);
  const esc=(v)=>String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const thead="<tr>"+headers.map(h=>`<th style="background:#0e1a27;color:#fff;font-weight:bold;border:1px solid #999;padding:5px">${esc(h)}</th>`).join("")+"</tr>";
  const tbody=rows.map(r=>"<tr>"+headers.map(h=>`<td style="border:1px solid #ccc;padding:5px">${esc(r[h])}</td>`).join("")+"</tr>").join("");
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"/><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(sheetName||"Sheet1")}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>${thead}${tbody}</table></body></html>`;
  const blob=new Blob(["\ufeff"+html],{type:"application/vnd.ms-excel"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// INBOUND MODULE
// ============================================================
function Inbound({orders,setOrders,customers,warehouses,isAdmin,perm="full",logActivity,setLedger,ledger=[],invoices=[],templates=[],setTemplates}){
  const mayAdd=isAdmin||canAdd(perm);
  const mayEdit=isAdmin||canEdit(perm);
  const mayFull=isAdmin||canDelete(perm);
  const inTemplates=templates.filter(t=>t.type==="IN");
  const[tplModal,setTplModal]=useState(false);
  const[filterWh,setFilterWh]=useState("");
  const[filterCust,setFilterCust]=useState("");
  const[search,setSearch]=useState("");
  const[showReceived,setShowReceived]=useState(false);
  const[modal,setModal]=useState(null);
  const lineTemplate={containerNo:"",cntrSize:"40HQ",loadingType:"F2P - Floor to Pallet",sku:"",description:"",plts:"",units:"",reference:"",ttsPo:""};
  const empty={type:"IN",submitted:today.toISOString().split("T")[0],eta:"",etd:"",customerId:"",project:"",warehouseCode:"",containerNo:"",cntrSize:"40HQ",loadingType:"F2P - Floor to Pallet",sku:"",description:"",plts:"",units:"",reference:"",ttsPo:"",notes:"",status:"Submitted",shipMode:"",carrierId:"",docCount:0,confirmedDate:"",receivedDate:"",shippedDate:"",lines:[{...lineTemplate}]};
  const[form,setForm]=useState(empty);
  const[recvModal,setRecvModal]=useState(null); // order pending receive
  const[recvDate,setRecvDate]=useState(today.toISOString().split("T")[0]);

  // "Show Received" lists every received order; otherwise show the open ones.
  const inbound=orders.filter(o=>o.type==="IN"&&o.status!=="Cancelled"&&(showReceived?o.status==="Received":o.status!=="Received"));
  const filtered=inbound.filter(o=>
    (!filterWh||o.warehouseCode===filterWh)&&
    (!filterCust||o.customerId===filterCust)&&
    (!search||[o.containerNo,o.sku,o.ttsPo,o.reference].join(" ").toLowerCase().includes(search.toLowerCase()))
  );
  const cust=(id)=>customers.find(c=>c.id===id);
  // an inbound is locked from editing if its ledger entry has any outbound movements
  const hasRelatedOut=(o)=>{ if(!o.ledgerId)return false; const l=ledger.find(x=>x.id===o.ledgerId); return !!(l&&l.movements&&l.movements.length>0); };
  const openInbound=inbound.filter(o=>o.status!=="Received");
  const totalInbound=openInbound.length;
  const awaiting=inbound.filter(o=>o.status==="Submitted").length;
  const scheduled=inbound.filter(o=>o.status==="Scheduled").length;

  const needsPallets=(lt)=>{const t=(lt||"").toLowerCase();return t.includes("f2p")||t.includes("p2p")||t.includes("f2f")||t.includes("floor")||t.includes("pallet");};
  const save=()=>{
    if(!form.customerId){alert("Customer is required.");return;}
    const c=cust(form.customerId);
    if(!hasValidRateSheet(c)){alert("Cannot create order: "+(c?.name||"this customer")+" has no active/valid rate sheet. Add or renew a quote sheet in Customers → Rate Card first.");return;}
    if(modal==="add"){
      if(!form.eta){alert("ETA is required.");return;}
      if(!form.warehouseCode){alert("Location (warehouse) is required.");return;}
      const lines=(form.lines&&form.lines.length?form.lines:[form]);
      const valid=lines.filter(l=>l.containerNo);
      if(valid.length===0){alert("Enter at least one line with a Container #.");return;}
      // For F2F / F2P / P2P lines, pallets are required (> 0)
      const badPlt=valid.find(l=>needsPallets(l.loadingType)&&!(Number(l.plts)>0));
      if(badPlt){alert("Pallets are required for "+(badPlt.loadingType||"this loading type")+" (container "+badPlt.containerNo+"). Enter the pallet count.");return;}
      const batch="B"+uid();
      const newOrders=valid.map(l=>({
        type:"IN",submitted:form.submitted,eta:form.eta,etd:"",customerId:form.customerId,project:form.project,warehouseCode:form.warehouseCode,
        containerNo:l.containerNo,cntrSize:l.cntrSize,loadingType:l.loadingType,sku:l.sku,description:l.description,
        plts:Number(l.plts||0),units:Number(l.units||0),reference:l.reference,ttsPo:l.ttsPo,notes:form.notes,
        status:"Submitted",shipMode:"",carrierId:"",docCount:0,confirmedDate:"",receivedDate:"",shippedDate:"",
        id:"O"+uid(),batchId:batch
      }));
      setOrders(p=>[...newOrders,...p]);
      logActivity("IN order created",valid.length>1?valid.length+" line items · "+valid.map(l=>l.containerNo).join(", "):valid[0].containerNo,form.customerId,form.warehouseCode);
    } else {
      if(!form.warehouseCode){alert("Location (warehouse) is required.");return;}
      if(needsPallets(form.loadingType)&&!(Number(form.plts)>0)){alert("Pallets are required for "+(form.loadingType||"this loading type")+".");return;}
      const updated={...form,plts:Number(form.plts||0),units:Number(form.units||0)};
      setOrders(p=>p.map(o=>o.id===form.id?updated:o));
      if(updated.status==="Received"&&updated.ledgerId){
        setLedger(p=>p.map(l=>l.id===updated.ledgerId?{...l,customerId:updated.customerId,project:updated.project,warehouseCode:updated.warehouseCode,containerNo:updated.containerNo,sku:updated.sku,description:updated.description,inPlts:Number(updated.plts||0),inUnits:Number(updated.units||0)}:l));
        logActivity("IN corrected (admin)",updated.containerNo,updated.customerId,updated.warehouseCode);
      }
    }
    setModal(null);
  };
  const confirmOrder=(o)=>{
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Scheduled",confirmedDate:today.toISOString().split("T")[0]}:x));
    logActivity("IN confirmed",o.containerNo,o.customerId,o.warehouseCode);
  };
  // group actions: act on all SKU lines of a container (same container# + customer + warehouse, still-open)
  const groupOf=(o)=>inbound.filter(x=>x.containerNo===o.containerNo&&x.customerId===o.customerId&&x.warehouseCode===o.warehouseCode);
  const confirmGroup=(g)=>{
    const ids=new Set(g.filter(x=>x.status==="Submitted").map(x=>x.id));
    if(ids.size===0)return;
    setOrders(p=>p.map(x=>ids.has(x.id)?{...x,status:"Scheduled",confirmedDate:today.toISOString().split("T")[0]}:x));
    logActivity("IN confirmed",g[0].containerNo+" ("+ids.size+" SKU)",g[0].customerId,g[0].warehouseCode);
  };
  const receiveGroup=(g,dateStr)=>{
    const rd=dateStr||today.toISOString().split("T")[0];
    const c=cust(g[0].customerId);
    if(!rateSheetCoveringDate(c,rd)){alert("Cannot receive on "+fmtD(rd)+": no rate card covers this date for "+(c?.name||"this customer")+". Adjust the receiving date or add/extend a quote sheet in Customers → Rate Card.");return false;}
    const toRecv=g.filter(x=>x.status==="Scheduled");
    if(toRecv.length===0)return false;
    const newLedger=[];
    const idMap={};
    toRecv.forEach(o=>{ const lid="L"+uid(); idMap[o.id]=lid; newLedger.push({id:lid,customerId:o.customerId,project:o.project,warehouseCode:o.warehouseCode,containerNo:o.containerNo,lot:"",sku:o.sku,description:o.description,loadingType:o.loadingType,ibDate:rd,inPlts:Number(o.plts||0),inUnits:Number(o.units||0),movements:[]}); });
    setOrders(p=>p.map(x=>idMap[x.id]?{...x,status:"Received",receivedDate:rd,ledgerId:idMap[x.id]}:x));
    setLedger(p=>[...newLedger,...p]);
    logActivity("IN received",g[0].containerNo+" ("+toRecv.length+" SKU)",g[0].customerId,g[0].warehouseCode);
    return true;
  };
  const voidGroup=(g)=>{
    const open=g.filter(x=>x.status!=="Received");
    if(open.length===0)return;
    if(!window.confirm("Void container "+g[0].containerNo+" ("+open.length+" SKU line"+(open.length>1?"s":"")+")? All will be cancelled."))return;
    const ids=new Set(open.map(x=>x.id));
    setOrders(p=>p.map(x=>ids.has(x.id)?{...x,status:"Cancelled"}:x));
    logActivity("IN voided",g[0].containerNo+" ("+open.length+" SKU)",g[0].customerId,g[0].warehouseCode);
  };
  const voidOrder=(o)=>{
    if(!window.confirm("Void inbound order "+o.containerNo+"? It will be cancelled and removed from active orders."))return;
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Cancelled"}:x));
    logActivity("IN voided",o.containerNo,o.customerId,o.warehouseCode);
  };
  const receiveOrder=(o,dateStr)=>{
    const rd=dateStr||today.toISOString().split("T")[0];
    const c=cust(o.customerId);
    if(!rateSheetCoveringDate(c,rd)){alert("Cannot receive on "+fmtD(rd)+": no rate card covers this date for "+(c?.name||"this customer")+". Adjust the receiving date or add/extend a quote sheet in Customers → Rate Card.");return false;}
    const newLedgerId="L"+uid();
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Received",receivedDate:rd,ledgerId:newLedgerId}:x));
    setLedger(p=>[{id:newLedgerId,customerId:o.customerId,project:o.project,warehouseCode:o.warehouseCode,
      containerNo:o.containerNo,lot:"",sku:o.sku,description:o.description,loadingType:o.loadingType,
      ibDate:rd,inPlts:Number(o.plts||0),inUnits:Number(o.units||0),movements:[]},...p]);
    logActivity("IN received",o.containerNo,o.customerId,o.warehouseCode);
    return true;
  };
  const openReceive=(o)=>{ setRecvDate(today.toISOString().split("T")[0]); setRecvModal(o); };
  const duplicateOrder=(o)=>{
    setForm({...empty,customerId:o.customerId,project:o.project,warehouseCode:o.warehouseCode,eta:"",notes:o.notes,
      lines:[{containerNo:o.containerNo,cntrSize:o.cntrSize,loadingType:o.loadingType,sku:o.sku,description:o.description,plts:o.plts,units:o.units,reference:o.reference,ttsPo:o.ttsPo}]});
    setModal("add");
  };
  const saveAsTemplate=()=>{
    if(!form.customerId){alert("Cannot save template: Customer is required.");return;}
    if(!form.warehouseCode){alert("Cannot save template: Location (warehouse) is required.");return;}
    const lines=(form.lines&&form.lines.length?form.lines:[form]);
    const valid=lines.filter(l=>l.containerNo);
    if(valid.length===0){alert("Cannot save template: enter at least one line with a Container #.");return;}
    const badPlt=valid.find(l=>needsPallets(l.loadingType)&&!(Number(l.plts)>0));
    if(badPlt){alert("Cannot save template: Pallets are required for "+(badPlt.loadingType||"this loading type")+" (container "+badPlt.containerNo+").");return;}
    const name=window.prompt("Template name:", (cust(form.customerId)?.name||"")+" inbound");
    if(!name)return;
    const data={customerId:form.customerId,project:form.project,warehouseCode:form.warehouseCode,notes:form.notes,lines:valid.map(l=>({...l}))};
    setTemplates&&setTemplates(p=>[...p,{id:"T"+uid(),name,type:"IN",data}]);
    alert("Template \""+name+"\" saved.");
  };
  const useTemplate=(t)=>{
    setForm({...empty,...t.data,submitted:today.toISOString().split("T")[0],status:"Submitted",lines:(t.data.lines&&t.data.lines.length?t.data.lines.map(l=>({...l})):[{...lineTemplate}])});
    setTplModal(false);setModal("add");
  };
  const unreceiveOrder=(o)=>{
    if(!window.confirm("Undo receive for "+o.containerNo+"? This removes its inventory ledger entry (only if nothing has shipped out from it)."))return;
    // block if the linked ledger has movements
    // handled by parent state; we check via a flag passed down is complex, so guard here optimistically
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Scheduled",receivedDate:"",ledgerId:""}:x));
    if(o.ledgerId)setLedger(p=>p.filter(l=>l.id!==o.ledgerId||(l.movements&&l.movements.length>0)));
    logActivity("IN receive undone (admin)",o.containerNo,o.customerId,o.warehouseCode);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        <KPI label="Total Inbound" value={totalInbound} color={C.blue}/>
        <KPI label="Awaiting Confirm" value={awaiting} color={C.orange}/>
        <KPI label="Scheduled" value={scheduled} color={C.amber}/>
      </div>

      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:C.white}}>Inbound Orders</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{showReceived?"Received only":"Submitted & Scheduled"}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {mayFull&&<label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:showReceived?C.amber:C.muted,cursor:"pointer"}}><input type="checkbox" checked={showReceived} onChange={e=>setShowReceived(e.target.checked)}/>Show Received</label>}
            <select value={filterWh} onChange={e=>setFilterWh(e.target.value)} style={{...s.input,width:160}}><option value="">All Warehouses</option>{warehouses.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select>
            <select value={filterCust} onChange={e=>setFilterCust(e.target.value)} style={{...s.input,width:150}}><option value="">All Customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SKU / Container / PO# / Ref" style={{...s.input,width:200}}/>
            <Btn sm v="ghost" onClick={()=>exportExcel("inbound.xls","Inbound",filtered.map(o=>({Submitted:o.submitted,ETA:o.eta,Customer:cust(o.customerId)?.name,Location:o.warehouseCode,Container:o.containerNo,Size:o.cntrSize,Loading_Type:o.loadingType,SKU:o.sku,Plts:o.plts,Units:o.units,Reference:o.reference,PO:o.ttsPo,Status:o.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
            {mayAdd&&<Btn sm v="ghost" onClick={()=>setTplModal(true)} style={{color:C.teal,borderColor:C.teal+"55"}}>Templates ({inTemplates.length})</Btn>}
            {mayAdd&&<Btn sm v="primary" onClick={()=>{setForm(empty);setModal("add");}}>+ New Inbound</Btn>}
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1100}}>
            <thead><tr style={{background:C.bg}}>{["Submitted","ETA","Customer","Location","Container #","Size","Loading Type","SKU / Description","Plts","Units","Reference","T2 PO#","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(()=>{
                // group filtered inbound by container (+customer+warehouse), preserving order
                const groups=[]; const gmap={};
                filtered.forEach(o=>{const k=o.containerNo+"|"+o.customerId+"|"+o.warehouseCode; if(!gmap[k]){gmap[k]={key:k,rows:[]};gmap[k].first=o;groups.push(gmap[k]);} gmap[k].rows.push(o);});
                let ri=0;
                return groups.map(g=>{
                  const rows=g.rows; const o0=rows[0]; const multi=rows.length>1;
                  const allSub=rows.every(x=>x.status==="Submitted");
                  const allSched=rows.every(x=>x.status==="Scheduled");
                  const anySub=rows.some(x=>x.status==="Submitted");
                  const anySched=rows.some(x=>x.status==="Scheduled");
                  const anyOpen=rows.some(x=>x.status!=="Received");
                  const sumPlts=rows.reduce((a,x)=>a+Number(x.plts||0),0);
                  const sumUnits=rows.reduce((a,x)=>a+Number(x.units||0),0);
                  const bg=(ri++%2)?C.bg+"66":"transparent";
                  return (
                    <React.Fragment key={g.key}>
                      {multi&&(
                        <tr style={{background:C.bg}}>
                          <td style={{...s.td,color:C.muted,fontSize:11.5}}>{fmtD(o0.submitted)}</td>
                          <td style={{...s.td,color:C.muted,fontSize:11.5}}>{fmtD(o0.eta)}</td>
                          <td style={{...s.td,fontWeight:700}}>{cust(o0.customerId)?.name}<div style={{fontSize:10,color:C.muted}}>{o0.project}</div></td>
                          <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{o0.warehouseCode}</td>
                          <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:800}}>{o0.containerNo}<div style={{fontSize:10,color:C.muted,fontWeight:400}}>{rows.length} SKUs</div></td>
                          <td style={s.td}><Tag label={o0.cntrSize} color="blue"/></td>
                          <td style={{...s.td,fontSize:11}}>{ltTag(o0.loadingType)}</td>
                          <td style={{...s.td,fontSize:11,color:C.muted,fontStyle:"italic"}}>whole container</td>
                          <td style={{...s.td,fontWeight:800,color:C.teal}}>{sumPlts}</td>
                          <td style={{...s.td,fontWeight:800}}>{num(sumUnits)}</td>
                          <td style={s.td}></td><td style={s.td}></td>
                          <td style={s.td}>{allSub?stTag("Submitted"):allSched?stTag("Scheduled"):rows.every(x=>x.status==="Received")?stTag("Received"):<Tag label="Mixed" color="orange"/>}</td>
                          <td style={s.td}>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {anySub&&mayAdd&&<Btn sm v="primary" onClick={()=>confirmGroup(rows)}>Confirm All</Btn>}
                              {anySched&&mayAdd&&<Btn sm v="success" onClick={()=>openReceive({...o0,_group:rows})}>Receive All</Btn>}
                              {mayFull&&anyOpen&&<Btn sm v="danger" onClick={()=>voidGroup(rows)}>Void All</Btn>}
                            </div>
                          </td>
                        </tr>
                      )}
                      {rows.map(o=>(
                        <tr key={o.id} style={{background:multi?"transparent":bg}}>
                          <td style={{...s.td,color:C.muted,fontSize:11.5}}>{multi?"":fmtD(o.submitted)}</td>
                          <td style={{...s.td,color:C.muted,fontSize:11.5}}>{multi?"":fmtD(o.eta)}</td>
                          <td style={{...s.td,fontWeight:700}}>{multi?"":<>{cust(o.customerId)?.name}<div style={{fontSize:10,color:C.muted}}>{o.project}</div></>}</td>
                          <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{multi?"":o.warehouseCode}</td>
                          <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700,paddingLeft:multi?24:undefined}}>{multi?<span style={{color:C.muted,fontSize:11}}>↳</span>:o.containerNo}</td>
                          <td style={s.td}>{multi?"":<Tag label={o.cntrSize} color="blue"/>}</td>
                          <td style={{...s.td,fontSize:11}}>{ltTag(o.loadingType)}</td>
                          <td style={s.td}>{o.sku}<div style={{fontSize:10,color:C.muted}}>{o.description}</div></td>
                          <td style={{...s.td,fontWeight:700,color:C.teal}}>{o.plts}</td>
                          <td style={{...s.td,fontWeight:700}}>{num(o.units)}</td>
                          <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{o.reference||"-"}</td>
                          <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{o.ttsPo||"-"}</td>
                          <td style={s.td}>{stTag(o.status)}</td>
                          <td style={s.td}>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {!multi&&o.status==="Submitted"&&mayAdd&&<Btn sm v="primary" onClick={()=>confirmOrder(o)}>Confirm</Btn>}
                              {!multi&&o.status==="Scheduled"&&mayAdd&&<Btn sm v="success" onClick={()=>openReceive(o)}>Receive</Btn>}
                              {mayEdit&&!hasRelatedOut(o)&&<Btn sm v="ghost" onClick={()=>{setForm(o);setModal("edit");}} style={{color:C.amber,borderColor:C.amber+"55"}}>Edit</Btn>}
                              {!multi&&mayAdd&&<Btn sm v="ghost" onClick={()=>duplicateOrder(o)} style={{color:C.blue,borderColor:C.blue+"55"}}>Duplicate</Btn>}
                              {mayFull&&o.status==="Received"&&!hasRelatedOut(o)&&<Btn sm v="ghost" onClick={()=>unreceiveOrder(o)} style={{color:C.orange,borderColor:C.orange+"55"}}>Undo Recv</Btn>}
                              {!multi&&mayFull&&o.status!=="Received"&&<Btn sm v="danger" onClick={()=>voidOrder(o)}>Void</Btn>}
                              {hasRelatedOut(o)&&<Tag label="🔒 Has Outbound" color="orange"/>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No inbound orders.</div>}
        </div>
      </div>

      {modal&&(
        <Modal title={modal==="add"?"New Inbound Order":"Edit Inbound Order"} onClose={()=>setModal(null)} wide>
          {modal==="edit"&&form.status==="Received"&&<div style={{background:C.amberD,border:`1px solid ${C.amberB}`,borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:12.5,color:C.amber}}>⚠ This order is already <strong>Received</strong>. Editing pallets/units/SKU here will also correct the linked inventory ledger entry.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            <TS label="Customer *" value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value,project:""}))}><option value="">Select...</option>{customers.filter(c=>c.status==="Active").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</TS>
            <TS label="Project" value={form.project} onChange={e=>setForm(f=>({...f,project:e.target.value}))}><option value="">-</option>{(cust(form.customerId)?.projects||[]).map(p=><option key={p}>{p}</option>)}</TS>
            <TS label="Warehouse (Location) *" value={form.warehouseCode} onChange={e=>setForm(f=>({...f,warehouseCode:e.target.value}))}><option value="">Select...</option>{warehouses.filter(w=>w.active).map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</TS>
            <TI label="ETA *" type="date" value={form.eta} onChange={e=>setForm(f=>({...f,eta:e.target.value}))}/>
            <TI label="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </div>

          {modal==="add"?(
            <>
              <div style={s.sec}>Line Items — one per container / SKU</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Tip: for multiple SKUs in the same container, add several lines with the <strong>same Container #</strong> and different SKUs.</div>
              <div style={{marginBottom:14}}>
                {(form.lines||[]).map((ln,idx)=>(
                  <div key={idx} style={{border:`1px solid ${C.border}`,borderRadius:8,padding:"12px",marginBottom:10,background:C.bg}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.amber}}>Line {idx+1}</span>
                      {(form.lines||[]).length>1&&<Btn sm v="danger" onClick={()=>setForm(f=>({...f,lines:f.lines.filter((_,i)=>i!==idx)}))}>Remove</Btn>}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                      <TI label="Container # *" value={ln.containerNo} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],containerNo:e.target.value};return{...f,lines:a};})}/>
                      <TS label="Size" value={ln.cntrSize} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],cntrSize:e.target.value};return{...f,lines:a};})}>{CONTAINER_TYPES.map(t=><option key={t}>{t}</option>)}</TS>
                      <TS label="Loading Type" value={ln.loadingType} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],loadingType:e.target.value};return{...f,lines:a};})}>{LOADING_TYPES.map(t=><option key={t}>{t}</option>)}</TS>
                      <TI label="T2 PO#" value={ln.ttsPo} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],ttsPo:e.target.value};return{...f,lines:a};})}/>
                      <TI label="SKU" value={ln.sku} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],sku:e.target.value};return{...f,lines:a};})}/>
                      <TI label="Description" value={ln.description} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],description:e.target.value};return{...f,lines:a};})}/>
                      <TI label={needsPallets(ln.loadingType)?"Pallets *":"Pallets"} type="number" value={ln.plts} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],plts:e.target.value};return{...f,lines:a};})}/>
                      <TI label="Units" type="number" value={ln.units} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],units:e.target.value};return{...f,lines:a};})}/>
                      <TI label="Reference" value={ln.reference} onChange={e=>setForm(f=>{const a=[...f.lines];a[idx]={...a[idx],reference:e.target.value};return{...f,lines:a};})}/>
                    </div>
                  </div>
                ))}
                <Btn sm v="ghost" onClick={()=>setForm(f=>({...f,lines:[...(f.lines||[]),{...lineTemplate}]}))} style={{color:C.teal,borderColor:C.teal+"55"}}>+ Add Line Item (another container / SKU)</Btn>
              </div>
            </>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
              <TI label="Container # *" value={form.containerNo} onChange={e=>setForm(f=>({...f,containerNo:e.target.value}))}/>
              <TS label="Container Size" value={form.cntrSize} onChange={e=>setForm(f=>({...f,cntrSize:e.target.value}))}>{CONTAINER_TYPES.map(t=><option key={t}>{t}</option>)}</TS>
              <TS label="Loading Type" value={form.loadingType} onChange={e=>setForm(f=>({...f,loadingType:e.target.value}))}>{LOADING_TYPES.map(t=><option key={t}>{t}</option>)}</TS>
              <TI label="SKU" value={form.sku} onChange={e=>setForm(f=>({...f,sku:e.target.value}))}/>
              <TI label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
              <TI label="Pallets" type="number" value={form.plts} onChange={e=>setForm(f=>({...f,plts:e.target.value}))}/>
              <TI label="Units" type="number" value={form.units} onChange={e=>setForm(f=>({...f,units:e.target.value}))}/>
              <TI label="Reference" value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/>
              <TI label="T2 PO#" value={form.ttsPo} onChange={e=>setForm(f=>({...f,ttsPo:e.target.value}))}/>
            </div>
          )}
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={save}>Save Order</Btn><Btn v="ghost" onClick={saveAsTemplate} style={{color:C.teal,borderColor:C.teal+"55"}}>Save as Template</Btn><Btn onClick={()=>setModal(null)}>Cancel</Btn></div>
        </Modal>
      )}

      {tplModal&&(
        <Modal title="Inbound Templates" onClose={()=>setTplModal(false)}>
          {inTemplates.length===0&&<div style={{padding:"20px",textAlign:"center",color:C.muted}}>No templates yet. Fill the New Inbound form and click "Save as Template".</div>}
          {inTemplates.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.input,borderRadius:8,marginBottom:8}}>
              <div>
                <div style={{fontWeight:700}}>{t.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{cust(t.data.customerId)?.name||"-"} · {(t.data.lines||[]).length} line(s) · {(t.data.lines||[])[0]?.containerNo||"no container"}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Btn sm v="primary" onClick={()=>useTemplate(t)}>Use</Btn>
                <Btn sm v="danger" onClick={()=>setTemplates(p=>p.filter(x=>x.id!==t.id))}>Delete</Btn>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {recvModal&&(
        <Modal title={recvModal._group?"Receive Container (all SKUs)":"Receive Order"} onClose={()=>setRecvModal(null)}>
          <div style={{background:C.input,borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:13}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.muted}}>Container</span><span style={{fontWeight:700,fontFamily:"monospace",color:C.amber}}>{recvModal.containerNo}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.muted}}>Customer</span><span style={{fontWeight:700}}>{cust(recvModal.customerId)?.name}</span></div>
            {recvModal._group?(
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.muted}}>SKUs to receive</span><span style={{fontWeight:700}}>{recvModal._group.filter(x=>x.status==="Scheduled").length} · {recvModal._group.reduce((a,x)=>a+Number(x.plts||0),0)} plt / {num(recvModal._group.reduce((a,x)=>a+Number(x.units||0),0))} u</span></div>
            ):(
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.muted}}>Quantity</span><span>{recvModal.plts} plt / {num(recvModal.units)} u</span></div>
            )}
          </div>
          <div style={{marginBottom:16}}>
            <TI label="Receiving Date" type="date" value={recvDate} onChange={e=>setRecvDate(e.target.value)} autoFocus/>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>Defaults to today. This date is used as the inbound date for storage billing.</div>
            {(()=>{const cov=rateSheetCoveringDate(cust(recvModal.customerId),recvDate);return cov?(
              <div style={{fontSize:11,color:C.green,marginTop:6}}>✓ Covered by rate card {cov.quoteNo} ({fmtD(cov.effectiveDate)}–{fmtD(cov.expiryDate)})</div>
            ):(
              <div style={{background:C.redD,border:`1px solid ${C.red}44`,borderRadius:6,padding:"8px 12px",marginTop:8,fontSize:12,color:C.red}}>⚠ No rate card covers {fmtD(recvDate)}. Choose a date within a quote sheet period, or add/extend one in Customers → Rate Card.</div>
            );})()}
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="success" onClick={()=>{const ok=recvModal._group?receiveGroup(recvModal._group,recvDate):receiveOrder(recvModal,recvDate);if(ok)setRecvModal(null);}} style={{opacity:rateSheetCoveringDate(cust(recvModal.customerId),recvDate)?1:0.5}}>Confirm Receive</Btn><Btn onClick={()=>setRecvModal(null)}>Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}
// OUTBOUND MODULE
// ============================================================
function Outbound({orders,setOrders,customers,warehouses,carriers,ledger,setLedger,isAdmin,perm="full",role,logActivity,invoices=[],templates=[],setTemplates}){
  const mayAdd=isAdmin||canAdd(perm);
  const mayEdit=isAdmin||canEdit(perm);
  const mayFull=isAdmin||canDelete(perm);
  const outTemplates=templates.filter(t=>t.type==="OUT");
  const[tplModal,setTplModal]=useState(false);
  const[shipModal,setShipModal]=useState(null);
  const[shipDate,setShipDate]=useState(today.toISOString().split("T")[0]);
  const[pick,setPick]=useState({}); // ledgerId -> {sel, plts, units}
  const[multiMode,setMultiMode]=useState(false);
  const[filterWh,setFilterWh]=useState("");
  const[filterCust,setFilterCust]=useState("");
  const[search,setSearch]=useState("");
  const[modal,setModal]=useState(null);
  const[freightModal,setFreightModal]=useState(null); // order awaiting freight confirm
  const[freightFee,setFreightFee]=useState("");
  const[selPrint,setSelPrint]=useState({}); // orderId -> true, for picking tickets
  // Freight cost may be entered by anyone with Full Access to Outbound (admin included).
  const isFreight=mayFull;
  const empty={type:"OUT",submitted:today.toISOString().split("T")[0],eta:"",etd:"",customerId:"",project:"",warehouseCode:"",containerNo:"",cntrSize:"",loadingType:"",sku:"",description:"",plts:"",units:"",reference:"",ttsPo:"",notes:"",status:"Submitted",shipMode:"FTL",carrierId:"",mktShipFee:"",serviceLines:[],docCount:0,confirmedDate:"",receivedDate:"",shippedDate:"",ledgerId:""};
  const[form,setForm]=useState(empty);
  const[showShipped,setShowShipped]=useState(false);

  const outbound=orders.filter(o=>o.type==="OUT"&&o.status!=="Cancelled"&&(showShipped?o.status==="Shipped":o.status!=="Shipped"));
  const filtered=outbound.filter(o=>
    (!filterWh||o.warehouseCode===filterWh)&&
    (!filterCust||o.customerId===filterCust)&&
    (!search||[o.containerNo,o.sku,o.ttsPo,o.reference].join(" ").toLowerCase().includes(search.toLowerCase()))
  );
  const cust=(id)=>customers.find(c=>c.id===id);
  const carrier=(id)=>carriers.find(c=>c.id===id);
  const orderInvoiced=(o)=>invoices.some(inv=>inv.lines.some(l=>String(l.key||"").includes(o.id)));
  const openOut=outbound.filter(o=>o.status!=="Shipped");
  const totalOut=openOut.length;
  const awaiting=openOut.filter(o=>o.status==="Submitted").length;
  const scheduled=openOut.filter(o=>o.status==="Scheduled").length;

  // available ledger lines for the selected customer (with balance > 0)
  const balOf=(l)=>{const o=(l.movements||[]).reduce((a,m)=>({p:a.p+(m.outPlts||0),u:a.u+(m.outUnits||0)}),{p:0,u:0});return {plts:l.inPlts-o.p,units:l.inUnits-o.u};};
  const availLedger=ledger.filter(l=>l.customerId===form.customerId&&(balOf(l).units>0||balOf(l).plts>0)).sort((a,b)=>(a.containerNo||"").localeCompare(b.containerNo||"")||(a.sku||"").localeCompare(b.sku||""));

  const save=()=>{
    if(!form.customerId){alert("Customer is required.");return;}
    const rc=cust(form.customerId);
    if(!hasValidRateSheet(rc)){alert("Cannot create order: "+(rc?.name||"this customer")+" has no active/valid rate sheet. Add or renew a quote sheet in Customers → Rate Card first.");return;}
    if(!form.etd){alert("ETD (estimated ship date) is required before you can process this order.");return;}
    const cleanLines=(form.serviceLines||[]).filter(l=>l.desc&&(Number(l.qty)||0)>0).map(l=>({desc:l.desc,qty:Number(l.qty||0),unitPrice:Number(l.unitPrice||0)}));

    // MULTI-ITEM MODE: create one outbound order per selected inventory line
    if(modal==="add"&&multiMode){
      const chosen=availLedger.filter(l=>pick[l.id]&&pick[l.id].sel);
      if(chosen.length===0){alert("Select at least one inventory item to ship.");return;}
      // validate each line's quantity against balance
      for(const l of chosen){
        const b=balOf(l); const q=pick[l.id];
        const pp=Number(q.plts||0), uu=Number(q.units||0);
        if(pp<=0&&uu<=0){alert(`Enter a quantity for ${l.containerNo} / ${l.sku}.`);return;}
        if(pp>b.plts){alert(`${l.containerNo}: ${pp} plt exceeds balance ${b.plts} plt.`);return;}
        if(uu>b.units){alert(`${l.containerNo}: ${num(uu)} u exceeds balance ${num(b.units)} u.`);return;}
      }
      const batch="B"+uid();
      const newOrders=chosen.map((l,i)=>({
        type:"OUT",submitted:form.submitted,eta:"",etd:form.etd,customerId:l.customerId,project:l.project||form.project||"",warehouseCode:l.warehouseCode,
        containerNo:l.containerNo,cntrSize:"",loadingType:l.loadingType||"",sku:l.sku,description:l.description,
        plts:Number(pick[l.id].plts||0),units:Number(pick[l.id].units||0),reference:form.reference,ttsPo:l.ttsPo||"",notes:form.notes,
        status:"Submitted",shipMode:form.shipMode,carrierId:form.carrierId,mktShipFee:"",serviceLines:i===0?cleanLines:[],
        docCount:0,confirmedDate:"",receivedDate:"",shippedDate:"",ledgerId:l.id,batchId:batch,id:"O"+uid()
      }));
      setOrders(p=>[...newOrders,...p]);
      logActivity("OUT order created",chosen.length+" items · "+chosen.map(l=>l.containerNo).join(", "),form.customerId,newOrders[0].warehouseCode);
      setModal(null);setMultiMode(false);setPick({});
      return;
    }

    // SINGLE MODE — every outbound must ship from inventory (no manual entry)
    if(!form.ledgerId){alert("Ship From Inventory is required. Select the inventory item this order ships from, so stock can be deducted.");return;}
    const src=ledger.find(x=>x.id===form.ledgerId);
    if(!src){alert("The selected inventory item no longer exists. Choose another.");return;}
    const plts=Number(form.plts||0);
    const units=Number(form.units||0);
    if(plts<=0&&units<=0){alert("Quantity cannot be 0. Enter pallets and/or units to ship.");return;}
    // An already-shipped order's movement is already deducted from the balance,
    // so only check availability for orders that haven't shipped yet.
    if(form.status!=="Shipped"){
      const b=balOf(src);
      if(plts>b.plts){alert(`Cannot process: ${plts} pallets exceeds available balance of ${b.plts} pallets for ${src.containerNo}.`);return;}
      if(units>b.units){alert(`Cannot process: ${num(units)} units exceeds available balance of ${num(b.units)} units for ${src.containerNo}.`);return;}
    }
    // These always mirror the inbound/inventory record — never free text.
    const locked={
      containerNo:src.containerNo, sku:src.sku, description:src.description,
      warehouseCode:src.warehouseCode, project:src.project||"", customerId:src.customerId,
    };
    if(modal==="add"){
      const o={...form,...locked,id:"O"+uid(),plts,units,mktShipFee:Number(form.mktShipFee||0),serviceLines:cleanLines};
      setOrders(p=>[o,...p]);
      logActivity("OUT order created",locked.containerNo,locked.customerId,locked.warehouseCode);
    } else {
      setOrders(p=>p.map(o=>o.id===form.id?{...form,...locked,plts,units,mktShipFee:Number(form.mktShipFee||0),serviceLines:cleanLines}:o));
    }
    setModal(null);
  };
  // Freight confirms the order and sets the MKT shipping fee (optional, $0 OK)
  const openFreightConfirm=(o)=>{ setFreightFee(o.mktShipFee?String(o.mktShipFee):""); setFreightModal(o); };
  const doFreightConfirm=()=>{
    const o=freightModal; const fee=Number(freightFee||0);
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Scheduled",confirmedDate:today.toISOString().split("T")[0],mktShipFee:fee}:x));
    logActivity("OUT freight confirmed",o.containerNo+(fee>0?" · MKT "+money(fee):" · no MKT fee"),o.customerId,o.warehouseCode);
    setFreightModal(null);setFreightFee("");
  };
  // Find the inventory line an order should draw from. Uses the stored link when
  // present; otherwise falls back to matching container + SKU for the customer.
  const resolveLedger=(o)=>{
    if(o.ledgerId){const l=ledger.find(x=>x.id===o.ledgerId);if(l)return l;}
    const cands=ledger.filter(l=>l.customerId===o.customerId&&l.containerNo===o.containerNo&&(!o.sku||l.sku===o.sku));
    if(cands.length===1)return cands[0];
    const withBal=cands.filter(l=>{const b=balOf(l);return b.plts>0||b.units>0;});
    return withBal.length===1?withBal[0]:null;
  };
  const shipOrder=(o,dateStr)=>{
    const sd=dateStr||today.toISOString().split("T")[0];
    const l=resolveLedger(o);
    if(!l){
      alert("Cannot ship: this order isn't linked to any inventory on hand, so the stock can't be deducted.\n\nOpen Edit on the order and choose the inventory item it ships from.");
      return false;
    }
    const b=balOf(l);
    const pp=Number(o.plts||0), uu=Number(o.units||0);
    if(pp<=0&&uu<=0){alert("Cannot ship: quantity is 0.");return false;}
    if(pp>b.plts||uu>b.units){
      alert(`Cannot ship: quantity exceeds current balance (${b.plts} plt / ${num(b.units)} u available). Edit the order first.`);
      return false;
    }
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Shipped",shippedDate:sd,ledgerId:l.id}:x));
    setLedger(p=>p.map(x=>x.id===l.id?{...x,movements:[...(x.movements||[]),{date:sd,outPlts:pp,outUnits:uu,ref:o.reference||o.containerNo}]}:x));
    logActivity("OUT shipped",o.containerNo,o.customerId,o.warehouseCode);
    return true;
  };
  const openShip=(o)=>{ setShipDate(today.toISOString().split("T")[0]); setShipModal(o); };
  const unshipOrder=(o)=>{
    if(!window.confirm("Undo ship for "+o.containerNo+"? This restores the inventory that was deducted."))return;
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Scheduled",shippedDate:""}:x));
    // remove the matching movement from the ledger
    if(o.ledgerId){
      setLedger(p=>p.map(l=>{
        if(l.id!==o.ledgerId)return l;
        const movs=l.movements||[];
        const ref=o.reference||o.containerNo;
        const idx=movs.map((m,i)=>({m,i})).reverse().find(x=>x.m.ref===ref&&Number(x.m.outUnits||0)===Number(o.units||0)&&Number(x.m.outPlts||0)===Number(o.plts||0));
        if(!idx)return l;
        return {...l,movements:movs.filter((_,i)=>i!==idx.i)};
      }));
    }
    logActivity("OUT ship undone (admin)",o.containerNo,o.customerId,o.warehouseCode);
  };
  const voidOrder=(o)=>{
    if(orderInvoiced(o)){alert("Cannot void: this order is already on an invoice.");return;}
    if(!window.confirm("Void outbound order "+o.containerNo+"? It will be cancelled."))return;
    setOrders(p=>p.map(x=>x.id===o.id?{...x,status:"Cancelled"}:x));
    logActivity("OUT voided",o.containerNo,o.customerId,o.warehouseCode);
  };
  const duplicateOrder=(o)=>{
    const{id,status,confirmedDate,receivedDate,shippedDate,...rest}=o;
    // keep ledgerId so the copy stays linked to inventory (required for shipping)
    const stillExists=ledger.some(l=>l.id===o.ledgerId);
    setForm({...rest,ledgerId:stillExists?o.ledgerId:"",submitted:today.toISOString().split("T")[0],etd:"",status:"Submitted",mktShipFee:"",serviceLines:(o.serviceLines||[]).map(l=>({...l}))});
    setModal("add");
  };
  const saveAsTemplate=()=>{
    if(!form.customerId){alert("Cannot save template: Customer is required.");return;}
    if(!form.containerNo){alert("Cannot save template: Container / Order # is required.");return;}
    const name=window.prompt("Template name:", (cust(form.customerId)?.name||"")+" outbound");
    if(!name)return;
    const{id,status,confirmedDate,receivedDate,shippedDate,ledgerId,submitted,mktShipFee,...data}=form;
    setTemplates&&setTemplates(p=>[...p,{id:"T"+uid(),name,type:"OUT",data}]);
    alert("Template \""+name+"\" saved.");
  };
  const useTemplate=(t)=>{
    setForm({...empty,...t.data,submitted:today.toISOString().split("T")[0],status:"Submitted"});
    setTplModal(false);setModal("add");
  };
  const printBOL=(o)=>{
    try{
      const c=cust(o.customerId);
      const wh=warehouses.find(w=>w.code===o.warehouseCode);
      const car=carrier(o.carrierId);
      const items=(o.serviceLines||[]);
      const cell="border:1px solid #000;padding:3px 5px;font-size:9px;vertical-align:top";
      const hd="border:1px solid #000;padding:2px 5px;font-size:8px;font-weight:bold;background:#e8e8e8;text-align:center";
      const lbl="font-size:7px;font-weight:bold;color:#000";
      const bolNo=o.reference||o.containerNo;
      const doc=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BOL ${bolNo}</title>
      <style>
        @page{size:letter;margin:0.4in}
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;font-size:10px}
        table{border-collapse:collapse;width:100%}
        .title{text-align:center;font-size:16px;font-weight:bold;letter-spacing:1px}
        .sub{text-align:center;font-size:8px;color:#333;margin-bottom:4px}
        .box{border:1px solid #000}
        td{vertical-align:top}
      </style></head>
      <body onload="setTimeout(function(){window.print()},500)">
        <table style="margin-bottom:2px"><tr>
          <td style="width:60%"><div class="title">BILL OF LADING</div><div class="sub">Trucking 2000 WMS</div></td>
          <td style="width:40%;text-align:right;font-size:9px">Date: <b>${fmtD(o.etd)||fmtD(o.submitted)||""}</b><br>Page 1 of 1</td>
        </tr></table>

        <table>
          <tr>
            <td style="${cell};width:50%">
              <span style="${lbl}">SHIP FROM</span><br>
              <b>${(wh&&wh.name)||o.warehouseCode||""}</b><br>${(wh&&wh.address)||""}<br>
              <span style="${lbl}">SID#:</span> ${o.warehouseCode||""} &nbsp; <span style="${lbl}">FOB:</span> &#9744;
            </td>
            <td style="${cell};width:50%">
              <span style="${lbl}">Bill of Lading Number:</span> <b>${bolNo}</b><br>
              <div style="text-align:center;color:#888;font-size:8px;margin:6px 0">B A R C O D E   S P A C E</div>
            </td>
          </tr>
          <tr>
            <td style="${cell}">
              <span style="${lbl}">SHIP TO</span><br>
              <b>${(c&&c.name)||""}</b><br>${(c&&c.address)||""}<br>
              <span style="${lbl}">CID#:</span> ${o.customerId||""} &nbsp; <span style="${lbl}">FOB:</span> &#9744;
            </td>
            <td style="${cell}">
              <span style="${lbl}">CARRIER NAME:</span> <b>${(car&&car.name)||""}</b><br>
              <span style="${lbl}">Trailer number:</span> ______________<br>
              <span style="${lbl}">Seal number(s):</span> ______________<br>
              <span style="${lbl}">SCAC:</span> ${(car&&car.scac)||"____"} &nbsp; <span style="${lbl}">Pro number:</span> __________
            </td>
          </tr>
          <tr>
            <td style="${cell}">
              <span style="${lbl}">THIRD PARTY FREIGHT CHARGES BILL TO:</span><br>
              <b>${(c&&c.name)||""}</b><br>${(c&&c.address)||""}
            </td>
            <td style="${cell}">
              <span style="${lbl}">Freight Charge Terms:</span> (prepaid unless marked)<br>
              Prepaid &#9745; &nbsp; Collect &#9744; &nbsp; 3rd Party &#9744;<br>
              <span style="${lbl}">Mode:</span> ${o.shipMode||"-"} &nbsp; &#9744; Master BOL w/ attached underlying BOLs
            </td>
          </tr>
        </table>

        <table style="margin-top:2px">
          <tr><td colspan="5" style="${hd};text-align:left">CUSTOMER ORDER INFORMATION</td></tr>
          <tr>
            <td style="${hd}">CUSTOMER ORDER NUMBER</td>
            <td style="${hd}"># PKGS</td>
            <td style="${hd}">WEIGHT</td>
            <td style="${hd}">PALLET/SLIP (Y/N)</td>
            <td style="${hd}">ADDITIONAL SHIPPER INFO</td>
          </tr>
          <tr>
            <td style="${cell};text-align:center">${o.ttsPo||o.reference||o.containerNo||""}</td>
            <td style="${cell};text-align:center">${o.plts||0}</td>
            <td style="${cell};text-align:center"></td>
            <td style="${cell};text-align:center">Y</td>
            <td style="${cell}">${o.project||""}</td>
          </tr>
          <tr>
            <td style="${cell};text-align:right;font-weight:bold">GRAND TOTAL</td>
            <td style="${cell};text-align:center;font-weight:bold">${o.plts||0}</td>
            <td style="${cell}"></td><td style="${cell}"></td><td style="${cell}"></td>
          </tr>
        </table>

        <table style="margin-top:2px">
          <tr><td colspan="6" style="${hd};text-align:left">CARRIER INFORMATION</td></tr>
          <tr>
            <td style="${hd}" colspan="2">HANDLING UNIT</td>
            <td style="${hd}" colspan="2">PACKAGE</td>
            <td style="${hd}">WEIGHT</td>
            <td style="${hd}">COMMODITY DESCRIPTION</td>
          </tr>
          <tr>
            <td style="${hd}">QTY</td><td style="${hd}">TYPE</td>
            <td style="${hd}">QTY</td><td style="${hd}">TYPE</td>
            <td style="${hd}"></td>
            <td style="${hd}">NMFC / CLASS</td>
          </tr>
          <tr>
            <td style="${cell};text-align:center">${o.plts||0}</td>
            <td style="${cell};text-align:center">PLT</td>
            <td style="${cell};text-align:center">${num(o.units)}</td>
            <td style="${cell};text-align:center">CTN</td>
            <td style="${cell};text-align:center"></td>
            <td style="${cell}"><b>${o.sku||""}</b>${o.description?("<br>"+o.description):""}</td>
          </tr>
          ${items.map(l=>`<tr><td style="${cell};text-align:center">${l.qty}</td><td style="${cell};text-align:center">EA</td><td style="${cell}"></td><td style="${cell}"></td><td style="${cell}"></td><td style="${cell}">${l.desc}</td></tr>`).join("")}
          <tr>
            <td style="${cell};text-align:right;font-weight:bold" colspan="4">GRAND TOTAL</td>
            <td style="${cell}"></td>
            <td style="${cell}"></td>
          </tr>
        </table>

        <table style="margin-top:2px"><tr>
          <td style="${cell};width:50%;font-size:8px">
            <b>Where the rate is dependent on value</b>, shippers are required to state specifically in writing the agreed or declared value of the property.<br>
            COD Amount: $________ &nbsp; Fee Terms: Collect &#9744; Prepaid &#9744;
          </td>
          <td style="${cell};width:50%;font-size:8px">
            <b>NOTE:</b> Liability limitation for loss or damage may apply. See 49 U.S.C. 14706(c)(1)(A) and (B).<br>
            Received, subject to the applicable rates, classifications and rules.
          </td>
        </tr></table>

        <table style="margin-top:2px"><tr>
          <td style="${cell};width:50%">
            <span style="${lbl}">SHIPPER SIGNATURE / DATE</span><br><br>
            ______________________________<br>
            <span style="font-size:7px">This is to certify that the above named materials are properly classified, packaged, marked and labeled, and are in proper condition for transportation per DOT regulations.</span>
          </td>
          <td style="${cell};width:50%">
            <span style="${lbl}">CARRIER SIGNATURE / PICKUP DATE</span><br><br>
            ______________________________<br>
            <span style="font-size:7px">Carrier acknowledges receipt of packages and required placards. Property described above is received in good order except as noted.</span>
          </td>
        </tr></table>
      </body></html>`;
      const blob=new Blob([doc],{type:"text/html"});
      const url=URL.createObjectURL(blob);
      const w=window.open(url,"_blank");
      if(!w){alert("Pop-up blocked. Please allow pop-ups. Then in the print dialog choose \"Save as PDF\" as the destination.");URL.revokeObjectURL(url);return;}
      setTimeout(()=>URL.revokeObjectURL(url),15000);
    }catch(err){alert("Could not open BOL: "+err.message);}
  };
  const printTickets=()=>{
    try{
      const toPrint=filtered.filter(o=>selPrint[o.id]);
      if(toPrint.length===0){alert("Select one or more orders (checkbox on the left) to print picking tickets.");return;}
      const rowsHtml=toPrint.map(o=>{
        const c=cust(o.customerId);
        return `<div style="border:1px solid #ccc;border-radius:8px;padding:16px 20px;margin-bottom:14px;page-break-inside:avoid">
          <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:10px">
            <div><strong style="font-size:18px">PICKING TICKET</strong><br><span style="color:#666;font-size:12px">${o.warehouseCode||""}</span></div>
            <div style="text-align:right"><strong style="font-size:16px;font-family:monospace">${o.containerNo||""}</strong><br><span style="color:#666;font-size:12px">${fmtD(o.etd)||""}</span></div>
          </div>
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <tr><td style="padding:3px 0;color:#666;width:130px">Customer</td><td style="padding:3px 0;font-weight:bold">${(c&&c.name)||""}</td></tr>
            <tr><td style="padding:3px 0;color:#666">Project</td><td style="padding:3px 0">${o.project||"-"}</td></tr>
            <tr><td style="padding:3px 0;color:#666;width:130px">SKU</td><td style="padding:3px 0;font-weight:bold">${o.sku||""}</td></tr>
            <tr><td style="padding:3px 0;color:#666">Description</td><td style="padding:3px 0">${o.description||""}</td></tr>
            <tr><td style="padding:3px 0;color:#666">Quantity</td><td style="padding:3px 0;font-weight:bold">${o.plts||0} pallets / ${num(o.units)} units</td></tr>
            <tr><td style="padding:3px 0;color:#666">Reference</td><td style="padding:3px 0">${o.reference||"-"}</td></tr>
            <tr><td style="padding:3px 0;color:#666">Shipping</td><td style="padding:3px 0">${o.shipMode||"-"}</td></tr>
          </table>
          <div style="margin-top:14px;border-top:1px dashed #ccc;padding-top:10px;font-size:12px;color:#666">Picked by: _______________&nbsp;&nbsp;&nbsp;Date: ___________&nbsp;&nbsp;&nbsp;Checked: ___________</div>
        </div>`;
      }).join("");
      const doc=`<!DOCTYPE html><html><head><title>Picking Tickets</title></head><body style="font-family:Arial,sans-serif;padding:30px;max-width:760px;margin:0 auto"><h2 style="color:#b8860b">Picking Tickets (${toPrint.length})</h2>${rowsHtml}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`;
      const blob=new Blob([doc],{type:"text/html"});
      const url=URL.createObjectURL(blob);
      const w=window.open(url,"_blank");
      if(!w){alert("Pop-up blocked. Please allow pop-ups for this site to print picking tickets.");URL.revokeObjectURL(url);return;}
      setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(err){
      alert("Could not open print view: "+err.message);
    }
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"stretch"}}>
        <KPI label="Total Outbound" value={totalOut} color={C.blue}/>
        <KPI label="Awaiting Confirm" value={awaiting} color={C.orange}/>
        <KPI label="Scheduled" value={scheduled} color={C.amber}/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Btn v="default" onClick={printTickets} style={{color:C.blue,borderColor:C.blue+"55"}}>Print Picking Tickets ({Object.values(selPrint).filter(Boolean).length})</Btn>
        </div>
      </div>

      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:C.white}}>Outbound Orders</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{showShipped?"Shipped only":"Submitted & Scheduled"}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {mayFull&&<label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:showShipped?C.amber:C.muted,cursor:"pointer"}}><input type="checkbox" checked={showShipped} onChange={e=>setShowShipped(e.target.checked)}/>Show Shipped</label>}
            <select value={filterWh} onChange={e=>setFilterWh(e.target.value)} style={{...s.input,width:160}}><option value="">All Warehouses</option>{warehouses.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select>
            <select value={filterCust} onChange={e=>setFilterCust(e.target.value)} style={{...s.input,width:150}}><option value="">All Customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SKU / Container / PO# / Ref" style={{...s.input,width:200}}/>
            <Btn sm v="ghost" onClick={()=>exportExcel("outbound.xls","Outbound",filtered.map(o=>({Submitted:o.submitted,ETD:o.etd,Customer:cust(o.customerId)?.name,Location:o.warehouseCode,Container:o.containerNo,SKU:o.sku,Plts:o.plts,Units:o.units,Reference:o.reference,Shipping:o.shipMode,Status:o.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
            {mayAdd&&<Btn sm v="ghost" onClick={()=>setTplModal(true)} style={{color:C.teal,borderColor:C.teal+"55"}}>Templates ({outTemplates.length})</Btn>}
            {mayAdd&&<Btn sm v="primary" onClick={()=>{setForm(empty);setMultiMode(false);setPick({});setModal("add");}}>+ New Outbound</Btn>}
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1100}}>
            <thead><tr style={{background:C.bg}}><th style={{...s.th,width:34}}><input type="checkbox" checked={filtered.length>0&&filtered.every(o=>selPrint[o.id])} onChange={e=>{const v={};if(e.target.checked)filtered.forEach(o=>v[o.id]=true);setSelPrint(v);}} title="Select all for printing"/></th>{["Submitted","ETD","Customer","Location","Container #","SKU / Description","Plts","Units","Reference","Shipping","MKT Fee","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((o,i)=>(
                <tr key={o.id} style={{background:selPrint[o.id]?C.blueD:(i%2?C.bg+"66":"transparent")}}>
                  <td style={s.td}><input type="checkbox" checked={!!selPrint[o.id]} onChange={e=>setSelPrint(p=>({...p,[o.id]:e.target.checked}))}/></td>
                  <td style={{...s.td,color:C.muted,fontSize:11.5}}>{fmtD(o.submitted)}</td>
                  <td style={{...s.td,color:C.muted,fontSize:11.5}}>{fmtD(o.etd)}</td>
                  <td style={{...s.td,fontWeight:700}}>{cust(o.customerId)?.name}<div style={{fontSize:10,color:C.muted}}>{o.project}</div></td>
                  <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{o.warehouseCode}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{o.containerNo}</td>
                  <td style={s.td}>{o.sku}<div style={{fontSize:10,color:C.muted}}>{o.description}</div></td>
                  <td style={{...s.td,fontWeight:700,color:C.teal}}>{o.plts}</td>
                  <td style={{...s.td,fontWeight:700}}>{num(o.units)}</td>
                  <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{o.reference||"-"}</td>
                  <td style={s.td}><Tag label={o.shipMode||"-"} color={o.shipMode==="FTL"?"green":"blue"}/></td>
                  <td style={{...s.td,fontWeight:700,color:o.mktShipFee>0?C.green:C.muted}}>{o.mktShipFee>0?money(o.mktShipFee):(o.status==="Submitted"?"—":"$0")}</td>
                  <td style={s.td}>{stTag(o.status)}</td>
                  <td style={s.td}>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {o.status==="Submitted"&&isFreight&&<Btn sm v="primary" onClick={()=>openFreightConfirm(o)}>Set Freight + Confirm</Btn>}
                      {o.status==="Submitted"&&!isFreight&&<Tag label="Awaiting Freight Cost" color="orange"/>}
                      {o.status==="Scheduled"&&mayAdd&&<Btn sm v="success" onClick={()=>openShip(o)}>Ship</Btn>}
                      {o.status==="Scheduled"&&isFreight&&<Btn sm v="ghost" onClick={()=>openFreightConfirm(o)} style={{color:C.blue,borderColor:C.blue+"55"}}>Edit Freight</Btn>}
                      {mayEdit&&!orderInvoiced(o)&&<Btn sm v="ghost" onClick={()=>{setForm(o);setModal("edit");}} style={{color:C.amber,borderColor:C.amber+"55"}}>Edit</Btn>}
                      {mayAdd&&<Btn sm v="ghost" onClick={()=>duplicateOrder(o)} style={{color:C.blue,borderColor:C.blue+"55"}}>Duplicate</Btn>}
                      <Btn sm v="ghost" onClick={()=>printBOL(o)} style={{color:C.purple,borderColor:C.purple+"55"}}>BOL</Btn>
                      {mayFull&&o.status==="Shipped"&&!orderInvoiced(o)&&<Btn sm v="ghost" onClick={()=>unshipOrder(o)} style={{color:C.orange,borderColor:C.orange+"55"}}>Undo Ship</Btn>}
                      {mayFull&&o.status!=="Shipped"&&!orderInvoiced(o)&&<Btn sm v="danger" onClick={()=>voidOrder(o)}>Void</Btn>}
                      {orderInvoiced(o)&&<Tag label="🔒 Invoiced" color="purple"/>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No outbound orders.</div>}
        </div>
      </div>

      {modal&&(
        <Modal title={modal==="add"?"New Outbound Order":"Edit Outbound Order"} onClose={()=>setModal(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            <TS label="Customer *" value={form.customerId} onChange={e=>setForm(f=>({...f,customerId:e.target.value,project:"",warehouseCode:"",containerNo:"",sku:"",description:"",plts:"",units:"",ledgerId:""}))}><option value="">Select...</option>{customers.filter(c=>c.status==="Active").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</TS>
            {multiMode?(
              <>
                <TS label="Project" value={form.project} onChange={e=>setForm(f=>({...f,project:e.target.value}))}><option value="">- from inventory -</option>{(cust(form.customerId)?.projects||[]).map(p=><option key={p}>{p}</option>)}</TS>
                <TI label="Warehouse" value="from inventory" readOnly style={{opacity:0.7,cursor:"not-allowed"}}/>
              </>
            ):(
              <>
                <TI label="Project" value={form.project||""} readOnly placeholder="— from inventory —" style={{opacity:0.7,cursor:"not-allowed"}}/>
                <TI label="Warehouse" value={form.warehouseCode||""} readOnly placeholder="— from inventory —" style={{opacity:0.7,cursor:"not-allowed"}}/>
              </>
            )}
          </div>
          {form.customerId&&availLedger.length>0&&(
            <div style={{marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.muted}}>Ship mode:</span>
              <Btn sm v={!multiMode?"primary":"ghost"} onClick={()=>setMultiMode(false)}>Single Item</Btn>
              <Btn sm v={multiMode?"primary":"ghost"} onClick={()=>setMultiMode(true)} style={!multiMode?{color:C.teal,borderColor:C.teal+"55"}:{}}>Multiple Items</Btn>
            </div>
          )}

          {multiMode&&form.customerId&&(
            <div style={{marginBottom:16}}>
              <div style={s.sec}>Select Inventory Items to Ship</div>
              {availLedger.length===0&&<div style={{padding:"16px",textAlign:"center",color:C.muted,fontSize:13}}>No available inventory for this customer.</div>}
              <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:C.bg}}>{["","Container","SKU","Location","Balance","Ship Plts","Ship Units"].map(h=><th key={h} style={{...s.th,padding:"7px 10px"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {availLedger.map((l,li)=>{const b=balOf(l);const q=pick[l.id]||{};const on=!!q.sel;
                      const sameContainer=availLedger.filter(x=>x.containerNo===l.containerNo);
                      const firstOfContainer=availLedger.findIndex(x=>x.containerNo===l.containerNo)===li;
                      const multiSku=sameContainer.length>1;
                      return(
                      <tr key={l.id} style={{background:on?C.tealD:"transparent",borderTop:firstOfContainer&&li>0?`2px solid ${C.border}`:undefined}}>
                        <td style={{...s.td,padding:"6px 10px"}}><input type="checkbox" checked={on} onChange={e=>setPick(pp=>({...pp,[l.id]:{...pp[l.id],sel:e.target.checked,plts:pp[l.id]?.plts??b.plts,units:pp[l.id]?.units??b.units}}))}/></td>
                        <td style={{...s.td,padding:"6px 10px",fontFamily:"monospace",color:C.amber,fontWeight:700}}>{firstOfContainer?l.containerNo:<span style={{color:C.muted,fontSize:11}}>↳ same container</span>}{firstOfContainer&&multiSku?<div style={{fontSize:10,color:C.muted,fontWeight:400}}>{sameContainer.length} SKUs · <span onClick={()=>setPick(pp=>{const n={...pp};sameContainer.forEach(x=>{const bb=balOf(x);n[x.id]={sel:true,plts:bb.plts,units:bb.units};});return n;})} style={{color:C.teal,cursor:"pointer",textDecoration:"underline"}}>select all</span></div>:null}</td>
                        <td style={{...s.td,padding:"6px 10px"}}>{l.sku}<div style={{fontSize:10,color:C.muted}}>{l.description}</div></td>
                        <td style={{...s.td,padding:"6px 10px",fontFamily:"monospace",color:C.teal,fontSize:11}}>{l.warehouseCode}</td>
                        <td style={{...s.td,padding:"6px 10px",color:C.muted}}>{b.plts} plt / {num(b.units)} u{(l.loadingType||"").toLowerCase().includes("full container")?<div style={{fontSize:9,color:C.amber}}>full container</div>:null}</td>
                        <td style={{...s.td,padding:"6px 10px"}}><input type="number" disabled={!on||(l.loadingType||"").toLowerCase().includes("full container")} value={on?(q.plts??b.plts):""} onChange={e=>setPick(pp=>({...pp,[l.id]:{...pp[l.id],sel:true,plts:e.target.value}}))} style={{...s.input,width:70,padding:"4px 6px",opacity:on?1:0.4}}/></td>
                        <td style={{...s.td,padding:"6px 10px"}}><input type="number" disabled={!on||(l.loadingType||"").toLowerCase().includes("full container")} value={on?(q.units??b.units):""} onChange={e=>setPick(pp=>({...pp,[l.id]:{...pp[l.id],sel:true,units:e.target.value}}))} style={{...s.input,width:80,padding:"4px 6px",opacity:on?1:0.4}}/></td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:6}}>Each selected item becomes its own outbound order (linked to that inventory), sharing the ETD, carrier, and reference below. One BOL/picking ticket per item.</div>
            </div>
          )}

          {!multiMode&&form.customerId&&availLedger.length===0&&(
            <div style={{background:C.redD,border:`1px solid ${C.red}44`,borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:12.5,color:C.red}}>
              This customer has no inventory on hand. An outbound order must ship from received inventory — receive an inbound order first.
            </div>
          )}

          {!multiMode&&form.customerId&&availLedger.length>0&&(
            <div style={{marginBottom:16}}>
              <label style={s.label}>Ship From Inventory *</label>
              <select value={form.ledgerId} onChange={e=>{const l=ledger.find(x=>x.id===e.target.value);if(l){const b=balOf(l);const fc=(l.loadingType||"").toLowerCase().includes("full container");setForm(f=>({...f,ledgerId:l.id,containerNo:l.containerNo,sku:l.sku,description:l.description,warehouseCode:l.warehouseCode,project:l.project||"",plts:fc?b.plts:f.plts,units:fc?b.units:f.units}));}else{setForm(f=>({...f,ledgerId:"",containerNo:"",sku:"",description:"",warehouseCode:"",project:""}));}}} style={s.input}>
                <option value="">- select inventory item -</option>
                {availLedger.map(l=>{const b=balOf(l);const fc=(l.loadingType||"").toLowerCase().includes("full container");return <option key={l.id} value={l.id}>{l.containerNo} | {l.sku} | bal {b.plts}plt / {num(b.units)}u{fc?" | FULL CONTAINER":""}</option>;})}
              </select>
              <div style={{fontSize:11,color:C.muted,marginTop:5}}>Required. Stock is deducted from this item when the order ships.</div>
            </div>
          )}
          {!multiMode&&form.ledgerId&&(()=>{const l=ledger.find(x=>x.id===form.ledgerId);if(!l)return null;const b=balOf(l);const fc=(l.loadingType||"").toLowerCase().includes("full container");return(
            <div style={{background:C.tealD,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"8px 14px",marginBottom:14,fontSize:12.5,color:C.teal}}>
              Available balance for {l.containerNo}: <strong>{b.plts} pallets / {num(b.units)} units</strong> — you cannot ship more than this.{fc?<span style={{display:"block",marginTop:4,color:C.amber}}>Full Container Storage: quantities are set to the full inventory balance.</span>:null}
            </div>
          );})()}
          {!multiMode&&(()=>{const fcLock=(()=>{const l=ledger.find(x=>x.id===form.ledgerId);return l&&(l.loadingType||"").toLowerCase().includes("full container");})();return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            <TI label="Container / Order #" value={form.containerNo} readOnly style={{opacity:0.7,cursor:"not-allowed"}}/>
            <TI label="SKU" value={form.sku} readOnly style={{opacity:0.7,cursor:"not-allowed"}}/>
            <TI label="Description" value={form.description} readOnly style={{opacity:0.7,cursor:"not-allowed"}}/>
            <TI label="ETD *" type="date" value={form.etd} onChange={e=>setForm(f=>({...f,etd:e.target.value}))}/>
            <TI label={fcLock?"Pallets * (full container)":"Pallets *"} type="number" value={form.plts} readOnly={fcLock} onChange={e=>fcLock?null:setForm(f=>({...f,plts:e.target.value}))} style={fcLock?{opacity:0.6,cursor:"not-allowed"}:{}}/>
            <TI label={fcLock?"Units * (full container)":"Units *"} type="number" value={form.units} readOnly={fcLock} onChange={e=>fcLock?null:setForm(f=>({...f,units:e.target.value}))} style={fcLock?{opacity:0.6,cursor:"not-allowed"}:{}}/>
            <TS label="Shipping Mode" value={form.shipMode} onChange={e=>setForm(f=>({...f,shipMode:e.target.value}))}>{SHIP_MODES.map(m=><option key={m}>{m}</option>)}</TS>
            <TS label="Carrier" value={form.carrierId} onChange={e=>setForm(f=>({...f,carrierId:e.target.value}))}><option value="">-</option>{carriers.filter(c=>c.active!==false).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</TS>
            <TI label="Reference" value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/>
            <TI label="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </div>
          );})()}
          {multiMode&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            <TI label="ETD *" type="date" value={form.etd} onChange={e=>setForm(f=>({...f,etd:e.target.value}))}/>
            <TS label="Shipping Mode" value={form.shipMode} onChange={e=>setForm(f=>({...f,shipMode:e.target.value}))}>{SHIP_MODES.map(m=><option key={m}>{m}</option>)}</TS>
            <TS label="Carrier" value={form.carrierId} onChange={e=>setForm(f=>({...f,carrierId:e.target.value}))}><option value="">-</option>{carriers.filter(c=>c.active!==false).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</TS>
            <TI label="Reference (shared)" value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/>
            <TI label="Notes" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </div>
          )}

          <div style={s.sec}>Extra Service Charges (optional)</div>
          <div style={{marginBottom:14}}>
            {(form.serviceLines||[]).map((sl,idx)=>(
              <div key={idx} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:8,alignItems:"end"}}>
                <TI label={idx===0?"Item Description":""} value={sl.desc} onChange={e=>setForm(f=>{const a=[...f.serviceLines];a[idx]={...a[idx],desc:e.target.value};return{...f,serviceLines:a};})} placeholder="e.g. Airbag, Labeling, Re-pack"/>
                <TI label={idx===0?"Qty":""} type="number" value={sl.qty} onChange={e=>setForm(f=>{const a=[...f.serviceLines];a[idx]={...a[idx],qty:e.target.value};return{...f,serviceLines:a};})}/>
                <TI label={idx===0?"Unit Price ($)":""} type="number" value={sl.unitPrice} onChange={e=>setForm(f=>{const a=[...f.serviceLines];a[idx]={...a[idx],unitPrice:e.target.value};return{...f,serviceLines:a};})}/>
                <Btn sm v="danger" onClick={()=>setForm(f=>({...f,serviceLines:f.serviceLines.filter((_,i)=>i!==idx)}))} style={{marginBottom:2}}>Remove</Btn>
              </div>
            ))}
            <Btn sm v="ghost" onClick={()=>setForm(f=>({...f,serviceLines:[...(f.serviceLines||[]),{desc:"",qty:1,unitPrice:""}]}))} style={{color:C.teal,borderColor:C.teal+"55"}}>+ Add Service Charge</Btn>
            {(form.serviceLines||[]).length>0&&<span style={{marginLeft:12,fontSize:12,color:C.muted}}>Subtotal: <strong style={{color:C.green}}>{money((form.serviceLines||[]).reduce((a,l)=>a+Number(l.qty||0)*Number(l.unitPrice||0),0))}</strong></span>}
          </div>

          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={save}>Save Order</Btn><Btn v="ghost" onClick={saveAsTemplate} style={{color:C.teal,borderColor:C.teal+"55"}}>Save as Template</Btn><Btn onClick={()=>setModal(null)}>Cancel</Btn></div>
        </Modal>
      )}

      {tplModal&&(
        <Modal title="Outbound Templates" onClose={()=>setTplModal(false)}>
          {outTemplates.length===0&&<div style={{padding:"20px",textAlign:"center",color:C.muted}}>No templates yet. Fill the New Outbound form and click "Save as Template".</div>}
          {outTemplates.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.input,borderRadius:8,marginBottom:8}}>
              <div>
                <div style={{fontWeight:700}}>{t.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{cust(t.data.customerId)?.name||"-"} · {t.data.sku||"no sku"} · {(t.data.serviceLines||[]).length} service line(s)</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <Btn sm v="primary" onClick={()=>useTemplate(t)}>Use</Btn>
                <Btn sm v="danger" onClick={()=>setTemplates(p=>p.filter(x=>x.id!==t.id))}>Delete</Btn>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {shipModal&&(
        <Modal title="Ship Order" onClose={()=>setShipModal(null)}>
          <div style={{background:C.input,borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:13}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.muted}}>Container / Order</span><span style={{fontWeight:700,fontFamily:"monospace",color:C.amber}}>{shipModal.containerNo}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:C.muted}}>Customer</span><span style={{fontWeight:700}}>{cust(shipModal.customerId)?.name}</span></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.muted}}>Quantity</span><span>{shipModal.plts} plt / {num(shipModal.units)} u</span></div>
          </div>
          <div style={{marginBottom:16}}>
            <TI label="Ship Date" type="date" value={shipDate} onChange={e=>setShipDate(e.target.value)} autoFocus/>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>Defaults to today. This is the date the outbound leaves and is recorded in inventory movements.</div>
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="success" onClick={()=>{if(shipOrder(shipModal,shipDate))setShipModal(null);}}>Confirm Ship</Btn><Btn onClick={()=>setShipModal(null)}>Cancel</Btn></div>
        </Modal>
      )}

      {freightModal&&(
        <Modal title="Freight Cost — Confirm Order" onClose={()=>{setFreightModal(null);setFreightFee("");}}>
          <div style={{background:C.input,borderRadius:8,padding:"14px 16px",marginBottom:16,fontSize:13}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted}}>Customer</span><span style={{fontWeight:700}}>{cust(freightModal.customerId)?.name}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted}}>Container / Order</span><span style={{fontWeight:700,fontFamily:"monospace",color:C.amber}}>{freightModal.containerNo}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted}}>SKU</span><span>{freightModal.sku}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{color:C.muted}}>Quantity</span><span>{freightModal.plts} plt / {num(freightModal.units)} u</span></div>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.muted}}>Shipping Mode</span><span><Tag label={freightModal.shipMode||"-"} color="blue"/></span></div>
          </div>
          <div style={{marginBottom:16}}>
            <TI label="MKT Shipping Fee ($) — optional" type="number" value={freightFee} onChange={e=>setFreightFee(e.target.value)} placeholder="0.00 (leave blank / 0 if none)" autoFocus/>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>This market-rate fee is billed to the customer when the order ships. You can confirm with $0 if there's no MKT charge.</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn v="success" onClick={doFreightConfirm}>{freightModal.status==="Scheduled"?"Update Freight Fee":"Confirm + Schedule"}</Btn>
            <Btn onClick={()=>{setFreightModal(null);setFreightFee("");}}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// HISTORY MODULE - completed orders (received & shipped)
// ============================================================
function History({orders,customers,warehouses}){
  const[filterWh,setFilterWh]=useState("");
  const[filterCust,setFilterCust]=useState("");
  const[filterType,setFilterType]=useState("");
  const[search,setSearch]=useState("");
  const[from,setFrom]=useState("");
  const[to,setTo]=useState("");
  const cust=(id)=>customers.find(c=>c.id===id);

  const completed=orders.filter(o=>o.status==="Received"||o.status==="Shipped").map(o=>({
    ...o,
    completedDate:o.status==="Received"?o.receivedDate:o.shippedDate,
  }));
  const filtered=completed.filter(o=>
    (!filterWh||o.warehouseCode===filterWh)&&
    (!filterCust||o.customerId===filterCust)&&
    (!filterType||o.type===filterType)&&
    (!search||[o.containerNo,o.sku,o.ttsPo,o.reference].join(" ").toLowerCase().includes(search.toLowerCase()))&&
    (!from||o.completedDate>=from)&&
    (!to||o.completedDate<=to)
  ).sort((a,b)=>(b.completedDate||"").localeCompare(a.completedDate||""));

  return(
    <div style={{...s.card,padding:0,overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:C.white}}>Completed Orders</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>Received &amp; Shipped — {filtered.length} records</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={filterWh} onChange={e=>setFilterWh(e.target.value)} style={{...s.input,width:140}}><option value="">All Warehouses</option>{warehouses.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select>
          <select value={filterCust} onChange={e=>setFilterCust(e.target.value)} style={{...s.input,width:140}}><option value="">All Customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{...s.input,width:110}}><option value="">All Types</option><option value="IN">Inbound</option><option value="OUT">Outbound</option></select>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SKU / Container / PO#" style={{...s.input,width:170}}/>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{...s.input,width:140}}/>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{...s.input,width:140}}/>
          <Btn sm v="ghost" onClick={()=>exportExcel("history.xls","History",filtered.map(o=>({Type:o.type,Date:o.completedDate,Customer:cust(o.customerId)?.name,Location:o.warehouseCode,Container:o.containerNo,SKU:o.sku,Plts:o.plts,Units:o.units,Reference:o.reference,Status:o.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1000}}>
          <thead><tr style={{background:C.bg}}>{["Type","Date","Customer","Location","Container #","SKU","Plts","Units","Reference","Shipping","Status"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((o,i)=>(
              <tr key={o.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                <td style={s.td}><Tag label={o.type} color={o.type==="IN"?"blue":"orange"}/></td>
                <td style={{...s.td,color:C.muted,fontSize:11.5}}>{fmtD(o.completedDate)}</td>
                <td style={{...s.td,fontWeight:700}}>{cust(o.customerId)?.name}</td>
                <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{o.warehouseCode}</td>
                <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{o.containerNo}</td>
                <td style={s.td}>{o.sku}</td>
                <td style={{...s.td,fontWeight:700,color:C.teal}}>{o.plts}</td>
                <td style={{...s.td,fontWeight:700}}>{num(o.units)}</td>
                <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{o.reference||"-"}</td>
                <td style={s.td}>{o.shipMode?<Tag label={o.shipMode} color="blue"/>:"-"}</td>
                <td style={s.td}>{stTag(o.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No completed orders in range.</div>}
      </div>
    </div>
  );
}

// ============================================================
// INVENTORY LEDGER - grouped, running balance (IN -> OUT -> BAL)
// ============================================================
function InventoryLedger({ledger,customers,warehouses}){
  const[filterWh,setFilterWh]=useState("");
  const[filterCust,setFilterCust]=useState("");
  const[search,setSearch]=useState("");
  const[balanceOnly,setBalanceOnly]=useState(false);
  const cust=(id)=>customers.find(c=>c.id===id);

  const balOf=(l)=>{const o=(l.movements||[]).reduce((a,m)=>({p:a.p+(m.outPlts||0),u:a.u+(m.outUnits||0)}),{p:0,u:0});return {plts:l.inPlts-o.p,units:l.inUnits-o.u};};

  const filtered=ledger.filter(l=>
    (!filterWh||l.warehouseCode===filterWh)&&
    (!filterCust||l.customerId===filterCust)&&
    (!search||[l.containerNo,l.sku,l.description].join(" ").toLowerCase().includes(search.toLowerCase()))&&
    (!balanceOnly||balOf(l).units>0||balOf(l).plts>0)
  );

  // KPIs
  const custCount=new Set(filtered.map(l=>l.customerId)).size;
  const whCount=new Set(filtered.map(l=>l.warehouseCode)).size;
  const balPlts=filtered.reduce((a,l)=>a+balOf(l).plts,0);
  const balUnits=filtered.reduce((a,l)=>a+balOf(l).units,0);

  // group by customer -> warehouse
  const groups={};
  filtered.forEach(l=>{
    const ck=l.customerId; const wk=l.warehouseCode;
    groups[ck]=groups[ck]||{};
    groups[ck][wk]=groups[ck][wk]||[];
    groups[ck][wk].push(l);
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        <KPI label="Customers" value={custCount} color={C.blue}/>
        <KPI label="Warehouses" value={whCount} color={C.teal}/>
        <KPI label="Balance Pallets" value={num(balPlts)} color={C.amber}/>
        <KPI label="Balance Units" value={num(balUnits)} color={C.green}/>
      </div>

      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontWeight:800,fontSize:16,color:C.white}}>Inventory Ledger</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:balanceOnly?C.amber:C.muted,cursor:"pointer"}}><input type="checkbox" checked={balanceOnly} onChange={e=>setBalanceOnly(e.target.checked)}/>Balance Only</label>
            <select value={filterWh} onChange={e=>setFilterWh(e.target.value)} style={{...s.input,width:150}}><option value="">All Warehouses</option>{warehouses.map(w=><option key={w.id} value={w.code}>{w.code}</option>)}</select>
            <select value={filterCust} onChange={e=>setFilterCust(e.target.value)} style={{...s.input,width:150}}><option value="">All Customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SKU / Container" style={{...s.input,width:170}}/>
            <Btn sm v="ghost" onClick={()=>exportExcel("inventory_ledger.xls","Inventory",filtered.map(l=>{const b=balOf(l);const o={p:l.inPlts-b.plts,u:l.inUnits-b.units};return{Customer:cust(l.customerId)?.name,Project:l.project,Location:l.warehouseCode,Container:l.containerNo,SKU:l.sku,Description:l.description,IB_Date:l.ibDate,In_Plts:l.inPlts,In_Units:l.inUnits,Out_Plts:o.p,Out_Units:o.u,Bal_Plts:b.plts,Bal_Units:b.units};}))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1100}}>
            <thead><tr style={{background:C.bg}}>{["Customer","Project","Location","Container #","Lot #","SKU","Description","IB Date","In Plts","In Units","OB Date","Out Plts","Out Units","Bal Plts","Bal Units"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {Object.keys(groups).map(ck=>(
                Object.keys(groups[ck]).map(wk=>(
                  groups[ck][wk].map((l,li)=>{
                    const b=balOf(l);
                    const totalOut=(l.movements||[]).reduce((a,m)=>({p:a.p+(m.outPlts||0),u:a.u+(m.outUnits||0)}),{p:0,u:0});
                    return(
                      <React.Fragment key={l.id}>
                        <tr style={{background:C.input+"55",borderTop:`2px solid ${C.border}`}}>
                          <td style={{...s.td,fontWeight:800,color:C.white}}>{cust(l.customerId)?.name||l.customerId}</td>
                          <td style={{...s.td,fontSize:11,color:C.muted}}>{l.project}</td>
                          <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{l.warehouseCode}</td>
                          <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{l.containerNo}</td>
                          <td style={{...s.td,fontSize:11}}>{l.lot||"-"}</td>
                          <td style={{...s.td,fontWeight:700}}>{l.sku}</td>
                          <td style={{...s.td,fontSize:11,color:C.muted}}>{l.description}</td>
                          <td style={{...s.td,fontSize:11,color:C.green}}>{fmtD(l.ibDate)}</td>
                          <td style={{...s.td,fontWeight:700,color:C.teal}}>{l.inPlts}</td>
                          <td style={{...s.td,fontWeight:700,color:C.green}}>{num(l.inUnits)}</td>
                          <td style={{...s.td,color:C.muted}}>—</td>
                          <td style={{...s.td,color:C.orange}}>{totalOut.p||0}</td>
                          <td style={{...s.td,color:C.orange}}>{num(totalOut.u)}</td>
                          <td style={{...s.td,fontWeight:800,color:C.amber}}>{b.plts}</td>
                          <td style={{...s.td,fontWeight:800,color:C.amber}}>{num(b.units)}</td>
                        </tr>
                        {!balanceOnly&&(l.movements||[]).map((m,mi)=>{
                          // running balance after this movement
                          const upto=(l.movements||[]).slice(0,mi+1).reduce((a,x)=>({p:a.p+(x.outPlts||0),u:a.u+(x.outUnits||0)}),{p:0,u:0});
                          return(
                            <tr key={l.id+"_m"+mi} style={{background:"transparent"}}>
                              <td style={s.td}></td><td style={s.td}></td><td style={s.td}></td>
                              <td colSpan={4} style={{...s.td,fontSize:11,color:C.muted,paddingLeft:24}}>↳ partial out · ref {m.ref||"-"}</td>
                              <td style={s.td}></td><td style={s.td}></td><td style={s.td}></td>
                              <td style={{...s.td,fontSize:11,color:C.orange}}>{fmtD(m.date)}</td>
                              <td style={{...s.td,color:C.orange}}>{m.outPlts||0}</td>
                              <td style={{...s.td,color:C.orange}}>{num(m.outUnits)}</td>
                              <td style={{...s.td,fontWeight:700,color:C.muted}}>{l.inPlts-upto.p}</td>
                              <td style={{...s.td,fontWeight:700,color:C.muted}}>{num(l.inUnits-upto.u)}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                ))
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No inventory found.</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ACTIVITY LOG
// ============================================================
function ActivityLog({activity,customers,warehouses}){
  const[filterType,setFilterType]=useState("");
  const[filterUser,setFilterUser]=useState("");
  const[search,setSearch]=useState("");
  const[page,setPage]=useState(1);
  const PAGE_SIZE=25;
  const cust=(id)=>customers.find(c=>c.id===id);
  const users=[...new Set(activity.map(a=>a.user).filter(Boolean))];
  const filtered=activity.filter(a=>
    (!filterType||a.action.includes(filterType))&&
    (!filterUser||a.user===filterUser)&&
    (!search||[a.detail,a.action,a.warehouseCode].join(" ").toLowerCase().includes(search.toLowerCase()))
  );
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const curPage=Math.min(page,totalPages);
  const pageRows=filtered.slice((curPage-1)*PAGE_SIZE,curPage*PAGE_SIZE);
  const exportRows=filtered.map(a=>({Timestamp:a.ts,User:a.user||"-",Action:a.action,Detail:a.detail||"",Customer:cust(a.customerId)?.name||a.customerId||"",Warehouse:a.warehouseCode||""}));
  return(
    <div style={{...s.card,padding:0,overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontWeight:800,fontSize:16,color:C.white}}>Activity Log <span style={{fontSize:12,color:C.muted,fontWeight:400}}>({filtered.length})</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(1);}} style={{...s.input,width:120}}><option value="">All Types</option><option value="IN">Inbound</option><option value="OUT">Outbound</option><option value="Invoice">Billing</option></select>
          <select value={filterUser} onChange={e=>{setFilterUser(e.target.value);setPage(1);}} style={{...s.input,width:120}}><option value="">All Users</option>{users.map(u=><option key={u} value={u}>{u}</option>)}</select>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search container#..." style={{...s.input,width:180}}/>
          <Btn sm v="ghost" onClick={()=>exportExcel("activity_log.xls","Activity Log",exportRows)} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
          <thead><tr style={{background:C.bg}}>{["Timestamp","User","Action","Detail","Customer","Warehouse"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {pageRows.map((a,i)=>(
              <tr key={i} style={{background:i%2?C.bg+"44":"transparent"}}>
                <td style={{...s.td,fontSize:11,color:C.muted,fontFamily:"monospace",whiteSpace:"nowrap"}}>{a.ts}</td>
                <td style={s.td}><Tag label={a.user||"-"} color={a.user==="system"?"slate":"blue"}/></td>
                <td style={{...s.td,fontWeight:700,whiteSpace:"nowrap"}}>{a.action}</td>
                <td style={{...s.td,fontSize:12,color:C.muted}}>{a.detail}</td>
                <td style={{...s.td,fontSize:12}}>{cust(a.customerId)?.name||"-"}</td>
                <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{a.warehouseCode||"-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No activity found.</div>}
      </div>
      {filtered.length>PAGE_SIZE&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,color:C.muted}}>Showing {(curPage-1)*PAGE_SIZE+1}–{Math.min(curPage*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <Btn sm v="ghost" onClick={()=>setPage(1)} style={{opacity:curPage===1?0.4:1}}>« First</Btn>
            <Btn sm v="ghost" onClick={()=>setPage(p=>Math.max(1,p-1))} style={{opacity:curPage===1?0.4:1}}>‹ Prev</Btn>
            <span style={{fontSize:12,color:C.white,fontWeight:700,padding:"0 8px"}}>Page {curPage} / {totalPages}</span>
            <Btn sm v="ghost" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} style={{opacity:curPage===totalPages?0.4:1}}>Next ›</Btn>
            <Btn sm v="ghost" onClick={()=>setPage(totalPages)} style={{opacity:curPage===totalPages?0.4:1}}>Last »</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CUSTOMER MANAGEMENT (with projects + rate card)
// ============================================================
function CustomerMgmt({customers,setCustomers,isAdmin,perm="full"}){
  const mayAdd=isAdmin||canAdd(perm);
  const mayEdit=isAdmin||canEdit(perm);
  const mayFull=isAdmin||canDelete(perm);
  const[modal,setModal]=useState(null);
  const[rcModal,setRcModal]=useState(null);
  const empty={name:"",contact:"",email:"",phone:"",address:"",billingTerms:"Net 30",status:"Active",projects:[],portalUser:"",portalPass:"",quoteSheets:[]};
  const[form,setForm]=useState(empty);
  const[projInput,setProjInput]=useState("");

  const save=()=>{
    if(!form.name)return;
    if(modal==="add"){
      const id=(form.customId||"").trim()||("CUST-"+uid());
      if(customers.some(c=>c.id.toLowerCase()===id.toLowerCase())){alert("Customer ID \""+id+"\" already exists. Please use a unique ID.");return;}
      setCustomers(p=>[...p,{...form,id}]);
    } else {
      setCustomers(p=>p.map(c=>c.id===form.id?{...form}:c));
    }
    setModal(null);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.white}}>Customer Management</h2>
          <div style={{fontSize:12,color:C.muted,marginTop:3}}>{customers.length} customers · contact info, projects &amp; rate cards</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Btn v="ghost" onClick={()=>exportExcel("customers.xls","Customers",customers.map(c=>({Customer_ID:c.id,Name:c.name,Contact:c.contact,Email:c.email,Phone:c.phone,Address:c.address,Projects:(c.projects||[]).join("; "),Terms:c.billingTerms,Portal_User:c.portalUser,Rate_Sheets:(c.quoteSheets||[]).length,Status:c.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
          {mayAdd&&<Btn v="primary" onClick={()=>{setForm({...empty,customId:""});setModal("add");}}>+ Add Customer</Btn>}
        </div>
      </div>

      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1000}}>
            <thead><tr style={{background:C.bg}}>{["Customer ID","Name","Contact","Email","Phone","Address","Projects","Terms","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {customers.map((c,i)=>(
                <tr key={c.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                  <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{c.id}</td>
                  <td style={{...s.td,fontWeight:700}}>{c.name}</td>
                  <td style={s.td}>{c.contact||"-"}</td>
                  <td style={{...s.td,fontSize:11,color:C.muted}}>{c.email||"-"}</td>
                  <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{c.phone||"-"}</td>
                  <td style={{...s.td,fontSize:11,color:C.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.address||"-"}</td>
                  <td style={s.td}>{(c.projects||[]).length?(c.projects||[]).map(p=><span key={p} style={{display:"inline-block",margin:"1px 2px"}}><Tag label={p} color="purple"/></span>):<span style={{color:C.muted}}>-</span>}</td>
                  <td style={{...s.td,fontSize:11}}>{c.billingTerms}</td>
                  <td style={s.td}>{stTag(c.status)}</td>
                  <td style={s.td}>
                    <div style={{display:"flex",gap:4}}>
                      <Btn sm v="ghost" onClick={()=>setRcModal(c)} style={{color:C.teal,borderColor:C.teal+"55"}}>Rate Card</Btn>
                      {mayEdit&&<Btn sm v="ghost" onClick={()=>{setForm({...c,projects:c.projects||[]});setModal("edit");}} style={{color:C.amber,borderColor:C.amber+"55"}}>Edit</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal&&(
        <Modal title={modal==="add"?"Add Customer":"Edit Customer"} onClose={()=>setModal(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            {modal==="add"&&<TI label="Customer ID (optional)" value={form.customId||""} onChange={e=>setForm(f=>({...f,customId:e.target.value}))} placeholder="auto if blank"/>}
            <TI label="Customer Name *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
            <TI label="Contact Person" value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/>
            <TI label="Email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
            <TI label="Phone" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
            <TS label="Billing Terms" value={form.billingTerms} onChange={e=>setForm(f=>({...f,billingTerms:e.target.value}))}>{BILLING_TERMS.map(t=><option key={t}>{t}</option>)}</TS>
            <TS label="Status" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{CUST_ST.map(t=><option key={t}>{t}</option>)}</TS>
          </div>
          <div style={{marginBottom:16}}><TA label="Address" rows={2} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
          <div style={{marginBottom:16}}>
            <label style={s.label}>Projects / Sub-accounts</label>
            <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
              {(form.projects||[]).map(p=>(
                <span key={p} style={{display:"flex",alignItems:"center",gap:4,background:C.purpleD,border:`1px solid ${C.purple}44`,borderRadius:4,padding:"3px 8px",fontSize:12,color:C.purple}}>
                  {p}<button onClick={()=>setForm(f=>({...f,projects:f.projects.filter(x=>x!==p)}))} style={{background:"none",border:"none",color:C.purple,cursor:"pointer"}}>×</button>
                </span>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input value={projInput} onChange={e=>setProjInput(e.target.value)} placeholder="e.g. LEI Costco" style={{...s.input,width:240}}/>
              <Btn sm onClick={()=>{if(projInput){setForm(f=>({...f,projects:[...(f.projects||[]),projInput]}));setProjInput("");}}}>+ Add Project</Btn>
            </div>
          </div>
          <div style={s.sec}>Customer Portal Login</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <TI label="Portal Username" value={form.portalUser} onChange={e=>setForm(f=>({...f,portalUser:e.target.value}))}/>
            <TI label="Portal Password" value={form.portalPass} onChange={e=>setForm(f=>({...f,portalPass:e.target.value}))}/>
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={save}>Save Customer</Btn><Btn onClick={()=>setModal(null)}>Cancel</Btn></div>
        </Modal>
      )}

      {rcModal&&<RateCardModal customer={customers.find(c=>c.id===rcModal.id)||rcModal} setCustomers={setCustomers} onClose={()=>setRcModal(null)} isAdmin={mayEdit} mayFull={mayFull}/>}
    </div>
  );
}

// Rate Card modal - manage quote sheets per customer
function RateCardModal({customer,setCustomers,onClose,isAdmin,mayFull=false}){
  const[editing,setEditing]=useState(null);
  const sheets=customer.quoteSheets||[];
  const blank=()=>({id:"qs"+uid(),quoteNo:"QT-"+new Date().getFullYear()+"-"+String(Math.floor(Math.random()*900)+100),effectiveDate:today.toISOString().split("T")[0],expiryDate:dFwd(365),status:"Active",rates:emptyRC()});
  const saveSheet=(sheet)=>{
    setCustomers(p=>p.map(c=>{
      if(c.id!==customer.id)return c;
      const existing=c.quoteSheets||[];
      const isNew=!existing.some(q=>q.id===sheet.id);
      let list;
      if(isNew){
        // When adding a NEW active sheet, expire any currently-active sheet the day before this one starts
        const dayBefore=(()=>{const d=new Date(sheet.effectiveDate);d.setDate(d.getDate()-1);return d.toISOString().split("T")[0];})();
        list=existing.map(q=>{
          if(sheet.status==="Active"&&q.status==="Active"){
            // only expire if the old sheet would otherwise still be running when the new one starts
            if(!q.expiryDate||q.expiryDate>=sheet.effectiveDate){
              return {...q,status:"Expired",expiryDate:dayBefore};
            }
          }
          return q;
        });
        list=[...list,sheet];
      } else {
        list=existing.map(q=>q.id===sheet.id?sheet:q);
      }
      return {...c,quoteSheets:list};
    }));
    setEditing(null);
  };
  const delSheet=(id)=>setCustomers(p=>p.map(c=>c.id===customer.id?{...c,quoteSheets:(c.quoteSheets||[]).filter(q=>q.id!==id)}:c));
  // Duplicate an existing sheet into a new editable draft (new quote no + id, today effective)
  const duplicateSheet=(src)=>{
    setEditing({
      id:"qs"+uid(),
      quoteNo:"QT-"+new Date().getFullYear()+"-"+String(Math.floor(Math.random()*900)+100),
      effectiveDate:today.toISOString().split("T")[0],
      expiryDate:dFwd(365),
      status:"Active",
      rates:{...emptyRC(),...src.rates}
    });
  };

  if(editing){
    const rc=editing.rates;
    const setRate=(k,v)=>setEditing(e=>({...e,rates:{...e.rates,[k]:Number(v)||0}}));
    const groups=[
      {sec:"Storage Rates",color:C.amber,fields:[["freeDays","Free Days"],["storagePerPallet","Per Pallet/Day"],["storagePerContainer","Per Container/Day"],["storagePerCarton","Per Carton/Day"],["storagePerPiece","Per Piece/Day"]]},
      {sec:"F2F Charges",color:C.blue,fields:[["f2fUnload","Unloading"],["f2fSort","Sorting"],["f2fHandling","Handling"],["f2fReload","Reloading"]]},
      {sec:"F2P Charges",color:C.purple,fields:[["f2pUnload","Unloading"],["f2pPalletize","Palletizing"],["f2pPallet","Pallet Fee"],["f2pWrap","Wrapping"],["f2pLabel","Labeling (extra)"],["f2pAirbag","Airbag (extra)"]]},
      {sec:"P2P Charges",color:C.teal,fields:[["p2pForklift","Forklift"],["p2pStorage","Storage"],["p2pLoading","Loading"],["p2pLabel","Labeling (extra)"],["p2pAirbag","Airbag (extra)"]]},
      {sec:"Other",color:C.orange,fields:[["handlingFee","Handling Fee"],["shippingFee","Shipping Fee"]]},
    ];
    return(
      <Modal title={`Quote Sheet — ${customer.name}`} onClose={()=>setEditing(null)} wide>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
          <TI label="Quote No." value={editing.quoteNo} onChange={e=>setEditing(x=>({...x,quoteNo:e.target.value}))}/>
          <TI label="Effective Date" type="date" value={editing.effectiveDate} onChange={e=>setEditing(x=>({...x,effectiveDate:e.target.value}))}/>
          <TI label="Expiry Date" type="date" value={editing.expiryDate} onChange={e=>setEditing(x=>({...x,expiryDate:e.target.value}))}/>
          <TS label="Status" value={editing.status} onChange={e=>setEditing(x=>({...x,status:e.target.value}))}><option>Active</option><option>Pending</option><option>Expired</option></TS>
        </div>
        {groups.map(g=>(
          <div key={g.sec} style={{marginBottom:16}}>
            <div style={{display:"inline-block",background:g.color+"22",color:g.color,border:`1px solid ${g.color}66`,borderLeft:`4px solid ${g.color}`,borderRadius:5,padding:"5px 14px",fontSize:12.5,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>{g.sec}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
              {g.fields.map(([k,lbl])=>(
                <TI key={k} label={lbl} type="number" value={rc[k]} onChange={e=>setRate(k,e.target.value)}/>
              ))}
            </div>
          </div>
        ))}
        <div style={{display:"flex",gap:8,marginTop:8}}><Btn v="primary" onClick={()=>saveSheet(editing)}>Save Quote Sheet</Btn><Btn onClick={()=>setEditing(null)}>Cancel</Btn></div>
      </Modal>
    );
  }

  return(
    <Modal title={`Rate Cards — ${customer.name}`} onClose={onClose} wide>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:12,color:C.muted}}>{sheets.length} quote sheet(s)</div>
        {isAdmin&&<Btn sm v="primary" onClick={()=>setEditing(blank())}>+ New Quote Sheet</Btn>}
      </div>
      {sheets.length===0&&<div style={{padding:"30px",textAlign:"center",color:C.muted}}>No quote sheets yet.</div>}
      {sheets.map(qs=>(
        <div key={qs.id} style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{fontFamily:"monospace",color:C.amber,fontWeight:700,fontSize:14}}>{qs.quoteNo}</span>
                {stTag(qs.status)}
              </div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>{fmtD(qs.effectiveDate)} – {fmtD(qs.expiryDate)} · Free days: <strong style={{color:C.blue}}>{qs.rates.freeDays||0}d</strong> · Storage: <strong style={{color:C.white}}>${qs.rates.storagePerPallet}/plt/day</strong></div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {isAdmin&&<Btn sm onClick={()=>setEditing(qs)}>Edit</Btn>}
              {isAdmin&&<Btn sm v="ghost" onClick={()=>duplicateSheet(qs)} style={{color:C.teal,borderColor:C.teal+"55"}}>Duplicate</Btn>}
              {mayFull&&<Btn sm v="danger" onClick={()=>delSheet(qs.id)}>Delete</Btn>}
            </div>
          </div>
        </div>
      ))}
    </Modal>
  );
}

// ============================================================
// CARRIERS
// ============================================================
function CarrierMgmt({carriers,setCarriers,isAdmin,perm="full"}){
  const mayAdd=isAdmin||canAdd(perm);
  const mayEdit=isAdmin||canEdit(perm);
  const mayFull=isAdmin||canDelete(perm);
  const[modal,setModal]=useState(null);
  const[form,setForm]=useState({name:"",scac:"",contact:"",phone:"",active:true});
  const save=()=>{
    if(!form.name){alert("Carrier name is required.");return;}
    const name=form.name.trim();
    const dup=carriers.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.id!==form.id);
    if(dup){alert("Carrier \""+name+"\" already exists.");return;}
    if(modal==="add")setCarriers(p=>[...p,{...form,name,id:"CR"+uid()}]);
    else setCarriers(p=>p.map(c=>c.id===form.id?{...form,name}:c));
    setModal(null);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.white}}>Carriers</h2><div style={{fontSize:12,color:C.muted,marginTop:3}}>Freight carriers used on outbound orders &amp; BOLs</div></div>
        {mayAdd&&<Btn v="primary" onClick={()=>{setForm({name:"",scac:"",contact:"",phone:"",active:true});setModal("add");}}>+ Add Carrier</Btn>}
      </div>
      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.bg}}>{["Carrier","SCAC","Contact","Phone","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{carriers.map((c,i)=>(
            <tr key={c.id} style={{background:i%2?C.bg+"66":"transparent"}}>
              <td style={{...s.td,fontWeight:700}}>{c.name}</td>
              <td style={{...s.td,fontFamily:"monospace",color:C.teal}}>{c.scac||"-"}</td>
              <td style={{...s.td,color:C.muted}}>{c.contact||"-"}</td>
              <td style={{...s.td,color:C.muted}}>{c.phone||"-"}</td>
              <td style={s.td}>{stTag(c.active!==false?"Active":"Disabled")}</td>
              <td style={s.td}><div style={{display:"flex",gap:4}}>{mayEdit&&<Btn sm onClick={()=>{setForm({...c});setModal("edit");}}>Edit</Btn>}{mayFull&&<Btn sm v="ghost" onClick={()=>setCarriers(p=>p.map(x=>x.id===c.id?{...x,active:!(x.active!==false)}:x))} style={{color:c.active!==false?C.red:C.green,borderColor:(c.active!==false?C.red:C.green)+"55"}}>{c.active!==false?"Disable":"Enable"}</Btn>}</div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {modal&&(
        <Modal title={modal==="add"?"Add Carrier":"Edit Carrier"} onClose={()=>setModal(null)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <TI label="Carrier Name *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
            <TI label="SCAC Code" value={form.scac} onChange={e=>setForm(f=>({...f,scac:e.target.value}))} placeholder="4-letter code"/>
            <TI label="Contact" value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}/>
            <TI label="Phone" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={save}>Save Carrier</Btn><Btn onClick={()=>setModal(null)}>Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// WAREHOUSES
// ============================================================
function WarehouseMgmt({warehouses,setWarehouses,isAdmin,perm="full"}){
  const mayAdd=isAdmin||canAdd(perm);
  const mayEdit=isAdmin||canEdit(perm);
  const mayFull=isAdmin||canDelete(perm);
  const[modal,setModal]=useState(null);
  const[form,setForm]=useState({code:"",name:"",address:"",active:true});
  const save=()=>{
    if(!form.code||!form.name)return;
    const code=form.code.trim();
    const dup=warehouses.some(w=>w.code.toLowerCase()===code.toLowerCase()&&w.id!==form.id);
    if(dup){alert("Warehouse code \""+code+"\" already exists. Please use a unique code.");return;}
    if(modal==="add")setWarehouses(p=>[...p,{...form,code,id:"WH"+uid()}]);
    else setWarehouses(p=>p.map(w=>w.id===form.id?{...form,code}:w));
    setModal(null);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.white}}>Warehouses</h2><div style={{fontSize:12,color:C.muted,marginTop:3}}>Locations used across the portal</div></div>
        {mayAdd&&<Btn v="primary" onClick={()=>{setForm({code:"",name:"",address:"",active:true});setModal("add");}}>+ Add Warehouse</Btn>}
      </div>
      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:C.bg}}>{["Code","Name","Address","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{warehouses.map((w,i)=>(
            <tr key={w.id} style={{background:i%2?C.bg+"66":"transparent"}}>
              <td style={{...s.td,fontFamily:"monospace",color:C.teal,fontWeight:700}}>{w.code}</td>
              <td style={{...s.td,fontWeight:700}}>{w.name}</td>
              <td style={{...s.td,color:C.muted}}>{w.address||"-"}</td>
              <td style={s.td}>{stTag(w.active?"Active":"Disabled")}</td>
              <td style={s.td}><div style={{display:"flex",gap:4}}>{mayEdit&&<Btn sm onClick={()=>{setForm({...w});setModal("edit");}}>Edit</Btn>}{mayFull&&<Btn sm v="ghost" onClick={()=>setWarehouses(p=>p.map(x=>x.id===w.id?{...x,active:!x.active}:x))} style={{color:w.active?C.red:C.green,borderColor:(w.active?C.red:C.green)+"55"}}>{w.active?"Disable":"Enable"}</Btn>}</div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {modal&&(
        <Modal title={modal==="add"?"Add Warehouse":"Edit Warehouse"} onClose={()=>setModal(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <TI label="Code *" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="T2-NJY-51RA"/>
            <TI label="Name *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
            <TI label="Address" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/>
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={save}>Save</Btn><Btn onClick={()=>setModal(null)}>Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// USERS (admin only)
// ============================================================
function UserMgmt({users,setUsers,warehouses=[]}){
  const[modal,setModal]=useState(null);
  const blank={name:"",username:"",password:"",role:"staff",active:true,permissions:{dashboard:"view",inbound:"add",outbound:"add",history:"view",inventory:"view"},allowedWarehouses:[]};
  const[form,setForm]=useState(blank);
  const save=()=>{
    if(!form.name||!form.username||!form.password){alert("Name, username and password are required.");return;}
    const uname=form.username.trim();
    const dup=users.some(u=>u.username.toLowerCase()===uname.toLowerCase()&&u.id!==form.id);
    if(dup){alert("Username \""+uname+"\" already exists. Please choose a unique username.");return;}
    const perms=form.role==="admin"?Object.fromEntries(ALL_SECTIONS.map(x=>[x.id,"full"])):(form.permissions||{});
    const clean={...form,username:uname,permissions:perms};
    if(modal==="add")setUsers(p=>[...p,{...clean,id:"U"+uid()}]);
    else setUsers(p=>p.map(u=>u.id===form.id?{...clean}:u));
    setModal(null);
  };
  const setPerm=(id,lvl)=>setForm(f=>({...f,permissions:{...(f.permissions||{}),[id]:lvl}}));
  const toggleWh=(code)=>setForm(f=>({...f,allowedWarehouses:(f.allowedWarehouses||[]).includes(code)?f.allowedWarehouses.filter(x=>x!==code):[...(f.allowedWarehouses||[]),code]}));
  const roleTag=(r)=>({admin:["Admin","amber"],warehouse:["Warehouse","teal"]}[r]||["Staff","blue"]);
  const permCount=(u)=>u.role==="admin"?"All":Object.values(u.permissions||{}).filter(v=>v&&v!=="none").length+" sections";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.white}}>Users &amp; Permissions</h2><div style={{fontSize:12,color:C.muted,marginTop:3}}>Admin assigns logins, section access and warehouse locations</div></div>
        <Btn v="primary" onClick={()=>{setForm(blank);setModal("add");}}>+ Add User</Btn>
      </div>
      <div style={{...s.card,padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead><tr style={{background:C.bg}}>{["Name","Username","Password","Role","Sections","Warehouses","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{users.map((u,i)=>{const[rl,rc]=roleTag(u.role);return(
              <tr key={u.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                <td style={{...s.td,fontWeight:700}}>{u.name}</td>
                <td style={{...s.td,fontFamily:"monospace",color:C.amber}}>{u.username}</td>
                <td style={{...s.td,fontFamily:"monospace",color:C.muted}}>{u.password}</td>
                <td style={s.td}><Tag label={rl} color={rc}/></td>
                <td style={{...s.td,fontSize:11,color:C.muted}}>{permCount(u)}</td>
                <td style={{...s.td,fontSize:11,color:C.muted}}>{u.role==="admin"?"All":((u.allowedWarehouses||[]).length?u.allowedWarehouses.join(", "):"All")}</td>
                <td style={s.td}>{stTag(u.active?"Active":"Disabled")}</td>
                <td style={s.td}><div style={{display:"flex",gap:4}}><Btn sm onClick={()=>{setForm({...blank,...u});setModal("edit");}}>Edit</Btn><Btn sm v="ghost" onClick={()=>setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x))} style={{color:u.active?C.red:C.green,borderColor:(u.active?C.red:C.green)+"55"}}>{u.active?"Disable":"Enable"}</Btn></div></td>
              </tr>
            );})}</tbody>
          </table>
        </div>
      </div>
      {modal&&(
        <Modal title={modal==="add"?"Add User":"Edit User"} onClose={()=>setModal(null)} wide>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <TI label="Full Name *" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
            <TI label="Username *" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))}/>
            <TI label="Password *" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/>
            <TS label="Role" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}><option value="staff">Staff</option><option value="warehouse">Warehouse (own location)</option><option value="admin">Admin (full control)</option></TS>
          </div>
          {form.role==="admin"?(
            <div style={{background:C.amberD,border:`1px solid ${C.amberB}`,borderRadius:8,padding:"12px 16px",fontSize:13,color:C.amber}}>Admin has full control of all sections and all warehouses.</div>
          ):(
            <>
              <div style={s.sec}>Section Access — choose the access level per section</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:16}}>
                {ALL_SECTIONS.map(sec=>{
                  const lvl=(form.permissions||{})[sec.id]||"none";
                  return(
                    <div key={sec.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"6px 12px",background:C.input,borderRadius:6,border:`1px solid ${lvl!=="none"?C.amber+"55":C.border}`}}>
                      <span style={{fontSize:13,fontWeight:600,color:lvl!=="none"?C.white:C.muted}}>{sec.label}</span>
                      <select value={lvl} onChange={e=>setPerm(sec.id,e.target.value)} style={{...s.input,width:140,padding:"5px 8px"}}>
                        {ACCESS_LEVELS.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.6}}>
                <strong>View Only</strong> = can see, no changes · <strong>Add Only</strong> = create new + workflow actions · <strong>Add &amp; Edit</strong> = also edit records · <strong>Full Access</strong> = also void/delete.
              </div>
              <div style={s.sec}>Warehouse Locations {form.role==="warehouse"?"(user sees only these)":"(blank = all)"}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
                {warehouses.map(w=>(
                  <label key={w.id} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,color:(form.allowedWarehouses||[]).includes(w.code)?C.white:C.muted,cursor:"pointer",padding:"6px 10px",background:C.input,borderRadius:6,border:`1px solid ${(form.allowedWarehouses||[]).includes(w.code)?C.teal+"55":C.border}`}}>
                    <input type="checkbox" checked={(form.allowedWarehouses||[]).includes(w.code)} onChange={()=>toggleWh(w.code)}/>{w.code}
                  </label>
                ))}
              </div>
            </>
          )}
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={save}>Save User</Btn><Btn onClick={()=>setModal(null)}>Cancel</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// BILLING MODULE - derives charges from orders + ledger
// Invoice = source of truth. Charges: Receiving, Transload,
// Storage (from ledger aging), Outbound handling/shipping.
// ============================================================
function BillingModule({orders,ledger,customers,invoices,setInvoices,isAdmin,perm="full",logActivity}){
  const mayAdd=isAdmin||canAdd(perm);
  const mayEdit=isAdmin||canEdit(perm);
  const mayFull=isAdmin||canDelete(perm);
  const[view,setView]=useState("unbilled"); // unbilled | invoices
  const[filterCust,setFilterCust]=useState("");
  const[searchC,setSearchC]=useState(""); // search by container
  const[sel,setSel]=useState({}); // chargeId -> true
  const[preview,setPreview]=useState(null); // invoice being previewed/created
  const[viewInv,setViewInv]=useState(null);
  const cust=(id)=>customers.find(c=>c.id===id);

  // active rate card for a customer at a given date
  const rateFor=(customerId,date)=>{
    const c=cust(customerId); if(!c)return null;
    const sheets=(c.quoteSheets||[]).filter(q=>q.status==="Active");
    const d=date||today.toISOString().split("T")[0];
    const match=sheets.find(q=>(!q.effectiveDate||q.effectiveDate<=d)&&(!q.expiryDate||q.expiryDate>=d));
    return (match||sheets[0])?.rates||null;
  };
  const loadType=(o)=>{
    const lt=(o.loadingType||"").toUpperCase();
    if(lt.includes("FULL CONTAINER"))return "FULL";
    if(lt.startsWith("F2F"))return "F2F";
    if(lt.startsWith("P2P"))return "P2P";
    return "F2P";
  };

  // Build list of chargeable items not yet invoiced
  const billedKeys=new Set();
  invoices.forEach(inv=>inv.lines.forEach(l=>billedKeys.add(l.key)));

  const charges=[];
  // 1a. Unloading / forklift — ONE charge per received container (not per SKU line).
  //     F2F & F2P → one unloading charge. P2P → one forklift charge. Full container → none.
  const receivedIn=orders.filter(o=>o.type==="IN"&&o.status==="Received");
  const contGroups={};
  receivedIn.forEach(o=>{
    const k=`${o.customerId}|${o.containerNo}|${o.receivedDate}`;
    if(!contGroups[k])contGroups[k]=o;   // first line represents the container
  });
  Object.entries(contGroups).forEach(([k,o])=>{
    const r=rateFor(o.customerId,o.receivedDate); if(!r)return;
    const lt=loadType(o);
    if(lt==="FULL")return;               // full container storage: no unload/forklift
    let unload=0,unloadLbl="";
    if(lt==="F2F"){unload=r.f2fUnload;unloadLbl="F2F Unloading";}
    else if(lt==="P2P"){unload=r.p2pForklift;unloadLbl="P2P Forklift";}
    else {unload=r.f2pUnload;unloadLbl="F2P Unloading";}
    if(unload>0){
      const key=`RCV-${o.customerId}-${o.containerNo}-${o.receivedDate}`;
      if(!billedKeys.has(key))charges.push({key,customerId:o.customerId,group:"Receiving",date:o.receivedDate,container:o.containerNo,desc:`${unloadLbl} (1× per container) — ${o.containerNo}`,qty:1,rate:unload,amount:unload});
    }
  });

  // 1b. Transload handling (per pallet) — still per SKU line
  receivedIn.forEach(o=>{
    const r=rateFor(o.customerId,o.receivedDate); if(!r)return;
    const plts=Number(o.plts||0);
    const lt=loadType(o);
    if(lt==="FULL")return;               // full container: storage only
    let trl=0,parts=[];
    if(lt==="F2P"){ trl=(r.f2pPalletize+r.f2pPallet+r.f2pWrap)*plts; parts.push("palletize/pallet/wrap"); }
    else if(lt==="F2F"){ trl=(r.f2fSort+r.f2fHandling+r.f2fReload)*plts; parts.push("sort/handle/reload"); }
    else { trl=(r.p2pStorage+r.p2pLoading)*plts; parts.push("load"); }
    if(trl>0){
      const key=`TRL-${o.id}`;
      if(!billedKeys.has(key))charges.push({key,customerId:o.customerId,group:"Transload",date:o.receivedDate,container:o.containerNo,desc:`${lt} Transload (${parts.join("/")}) — ${plts} plt`,qty:plts,rate:trl/Math.max(plts,1),amount:trl});
    }
  });
  // 2. Storage charges — segmented by outbound events.
  //    Segment 1: inbound date → day before first outbound, at full pallets, minus free days.
  //    Later segments: outbound date → day before next outbound (or today), at remaining pallets, NO free days.
  //    Full Container Storage: flat per-container/day (ignores pallet count). Others: per-pallet/day × pallets in segment.
  ledger.forEach(l=>{
    const r=rateFor(l.customerId,l.ibDate); if(!r)return;
    const isFullContainer=(l.loadingType||"").toLowerCase().includes("full container");
    const perDayRate=isFullContainer?(r.storagePerContainer||0):(r.storagePerPallet||0);
    if(perDayRate<=0)return;
    const freeDays=r.freeDays||0;
    const movs=[...(l.movements||[])].filter(m=>m.date).sort((a,b)=>a.date.localeCompare(b.date));

    // Build segments
    const segs=[];
    let segStart=l.ibDate;
    let curPlts=l.inPlts;
    let curUnits=l.inUnits;
    let first=true;
    movs.forEach(m=>{
      // segment runs THROUGH the outbound day (inclusive); pallets on that day are the pre-outbound count
      segs.push({start:segStart,end:m.date,plts:curPlts,units:curUnits,free:first?freeDays:0});
      curPlts-=Number(m.outPlts||0);
      curUnits-=Number(m.outUnits||0);
      segStart=dayAfter(m.date); // next segment starts the day AFTER the outbound
      first=false;
    });
    // final open segment (remaining inventory, up to today)
    if(curPlts>0||curUnits>0||segs.length===0){
      segs.push({start:segStart,end:todayStr(),plts:curPlts,units:curUnits,free:first?freeDays:0,open:true});
    }

    segs.forEach((seg,idx)=>{
      const rawDays=daysInclusive(seg.start,seg.end);
      const days=Math.max(0,rawDays-(seg.free||0));
      if(days<=0)return;
      let amount,desc,qty,rate;
      if(isFullContainer){
        qty=1; rate=perDayRate*days; amount=perDayRate*days;
        desc=`Container storage ${l.containerNo} — ${days}d (${fmtD(seg.start)}–${fmtD(seg.end)})${seg.free?` after ${seg.free}d free`:""}`;
      } else {
        if(seg.plts<=0)return;
        qty=seg.plts; rate=perDayRate*days; amount=seg.plts*perDayRate*days;
        desc=`Storage ${l.sku} — ${seg.plts} plt × ${days}d (${fmtD(seg.start)}–${fmtD(seg.end)})${seg.free?` after ${seg.free}d free`:""}`;
      }
      if(amount<=0)return;
      // closed segments have stable keys; the open segment re-bills until invoiced
      const key=`STR-${l.id}-seg${idx}`;
      if(!billedKeys.has(key))charges.push({key,customerId:l.customerId,group:"Storage",date:seg.end,container:l.containerNo,desc,qty,rate,amount});
    });
  });
  // 3. Outbound handling/shipping from shipped orders
  orders.filter(o=>o.type==="OUT"&&o.status==="Shipped").forEach(o=>{
    // Outbound rate follows the INBOUND quotation: use the rate sheet active when the
    // linked inventory was received (its ibDate). Fall back to shipped date if unlinked.
    const linked=o.ledgerId?ledger.find(l=>l.id===o.ledgerId):null;
    const rateDate=linked?.ibDate||o.shippedDate;
    const r=rateFor(o.customerId,rateDate); if(!r)return;
    const plts=Number(o.plts||0);
    const hand=(r.handlingFee||0)*Math.max(plts,1);
    if(hand>0){
      const key=`OBH-${o.id}`;
      if(!billedKeys.has(key))charges.push({key,customerId:o.customerId,group:"Outbound",date:o.shippedDate,container:o.containerNo,desc:`Outbound handling — ${o.containerNo} (${plts} plt)`,qty:plts,rate:r.handlingFee,amount:hand});
    }
    if(r.shippingFee>0){
      const key=`OBS-${o.id}`;
      if(!billedKeys.has(key))charges.push({key,customerId:o.customerId,group:"Outbound",date:o.shippedDate,container:o.containerNo,desc:`Shipping fee — ${o.containerNo}`,qty:1,rate:r.shippingFee,amount:r.shippingFee});
    }
    // MKT (market-rate) shipping fee entered on the order itself
    const mkt=Number(o.mktShipFee||0);
    if(mkt>0){
      const key=`MKT-${o.id}`;
      if(!billedKeys.has(key))charges.push({key,customerId:o.customerId,group:"Outbound",date:o.shippedDate,container:o.containerNo,desc:`MKT shipping — ${o.containerNo} (${o.shipMode||""})`,qty:1,rate:mkt,amount:mkt});
    }
    // Extra service charges entered on the order (airbag, labeling, etc.)
    (o.serviceLines||[]).forEach((sl,idx)=>{
      const amt=Number(sl.qty||0)*Number(sl.unitPrice||0);
      if(amt<=0)return;
      const key=`SVC-${o.id}-${idx}`;
      if(!billedKeys.has(key))charges.push({key,customerId:o.customerId,group:"Service",date:o.shippedDate,container:o.containerNo,desc:`${sl.desc} — ${o.containerNo}`,qty:sl.qty,rate:sl.unitPrice,amount:amt});
    });
  });

  const filtered=charges.filter(c=>(!filterCust||c.customerId===filterCust)&&(!searchC||(c.container||"").toLowerCase().includes(searchC.toLowerCase())));
  const invFiltered=invoices.filter(inv=>(!filterCust||inv.customerId===filterCust)&&(!searchC||inv.id.toLowerCase().includes(searchC.toLowerCase())||inv.lines.some(l=>(l.desc||"").toLowerCase().includes(searchC.toLowerCase()))));
  const selectedCharges=filtered.filter(c=>sel[c.key]);
  const selTotal=selectedCharges.reduce((a,c)=>a+c.amount,0);

  const termDays=(terms)=>{const m={"Net 15":15,"Net 30":30,"Net 45":45,"Net 60":60,"Due on receipt":0,"Prepaid":0};return m[terms]??30;};

  const createInvoice=()=>{
    if(selectedCharges.length===0)return;
    const byCust={};
    selectedCharges.forEach(c=>{(byCust[c.customerId]=byCust[c.customerId]||[]).push(c);});
    const newInvoices=Object.keys(byCust).map(cid=>{
      const c=cust(cid);
      const lines=byCust[cid].map(x=>({key:x.key,group:x.group,desc:x.desc,qty:x.qty,rate:x.rate,amount:x.amount}));
      const subtotal=lines.reduce((a,l)=>a+l.amount,0);
      const issue=today.toISOString().split("T")[0];
      const due=dFwd(termDays(c?.billingTerms));
      return {id:"INV-"+new Date().getFullYear()+"-"+String(Math.floor(Math.random()*9000)+1000),customerId:cid,issueDate:issue,dueDate:due,terms:c?.billingTerms||"Net 30",lines,subtotal,total:subtotal,status:"Unpaid"};
    });
    setInvoices(p=>[...newInvoices,...p]);
    newInvoices.forEach(inv=>logActivity&&logActivity("Invoice created",inv.id+" · "+money(inv.total),inv.customerId,""));
    setSel({});setPreview(null);setView("invoices");
  };

  const markPaid=(id)=>setInvoices(p=>p.map(i=>i.id===id?{...i,status:i.status==="Paid"?"Unpaid":"Paid"}:i));
  const delInvoice=(id)=>{ if(window.confirm("Delete invoice "+id+"? Charges become billable again."))setInvoices(p=>p.filter(i=>i.id!==id)); };
  const printInvoice=(inv)=>{
    const c=cust(inv.customerId);
    const rows=inv.lines.map(l=>`<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd">${l.group}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd">${l.desc}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right">${money(l.amount)}</td></tr>`).join("");
    const w=window.open("","_blank");
    if(w){w.document.write(`<div style="font-family:Arial;padding:40px;max-width:700px"><h1 style="color:#b8860b">INVOICE ${inv.id}</h1><p><b>${c?.name||""}</b><br>${c?.address||""}<br>${c?.email||""}</p><p>Issued: ${fmtD(inv.issueDate)} · Due: ${fmtD(inv.dueDate)} · Terms: ${inv.terms}</p><table style="width:100%;border-collapse:collapse;margin-top:20px"><tr style="background:#f0f0f0"><th style="padding:8px 10px;text-align:left">Type</th><th style="padding:8px 10px;text-align:left">Description</th><th style="padding:8px 10px;text-align:right">Amount</th></tr>${rows}<tr><td colspan="2" style="padding:10px;text-align:right;font-weight:bold;font-size:18px">TOTAL</td><td style="padding:10px;text-align:right;font-weight:bold;font-size:18px">${money(inv.total)}</td></tr></table></div>`);setTimeout(()=>w.print&&w.print(),300);}
  };

  const GROUP_COLOR={Receiving:"blue",Transload:"purple",Storage:"amber",Outbound:"orange",Service:"teal"};

  // Invoice KPIs
  const totalUnpaid=invoices.filter(i=>i.status==="Unpaid").reduce((a,i)=>a+i.total,0);
  const totalPaid=invoices.filter(i=>i.status==="Paid").reduce((a,i)=>a+i.total,0);
  const unbilledTotal=charges.reduce((a,c)=>a+c.amount,0);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        <KPI label="Unbilled Charges" value={money(unbilledTotal)} color={C.orange}/>
        <KPI label="Outstanding (Unpaid)" value={money(totalUnpaid)} color={C.red}/>
        <KPI label="Collected (Paid)" value={money(totalPaid)} color={C.green}/>
        <KPI label="Invoices" value={invoices.length} color={C.blue}/>
      </div>

      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`}}>
        {[["unbilled","Unbilled Charges"],["invoices","Invoices ("+invoices.length+")"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setView(id)} style={{background:"none",border:"none",cursor:"pointer",padding:"10px 20px",fontSize:13,fontWeight:view===id?700:500,color:view===id?C.amber:C.muted,borderBottom:`2px solid ${view===id?C.amber:"transparent"}`,marginBottom:-1}}>{lbl}</button>
        ))}
      </div>

      {view==="unbilled"&&(
        <div style={{...s.card,padding:0,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:C.white}}>Unbilled Charges</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>Auto-derived from receiving, storage aging &amp; shipments</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <select value={filterCust} onChange={e=>{setFilterCust(e.target.value);setSel({});}} style={{...s.input,width:150}}><option value="">All Customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input value={searchC} onChange={e=>setSearchC(e.target.value)} placeholder="Search container #" style={{...s.input,width:170}}/>
              <Btn sm v="ghost" onClick={()=>exportExcel("unbilled_charges.xls","Unbilled",filtered.map(c=>({Type:c.group,Date:c.date,Customer:cust(c.customerId)?.name,Container:c.container,Description:c.desc,Qty:c.qty,Rate:c.rate,Amount:c.amount})))} style={{color:C.green,borderColor:C.green+"55"}}>Excel</Btn>
              <Btn sm v="ghost" onClick={()=>{const all={};filtered.forEach(c=>all[c.key]=true);setSel(all);}}>Select All</Btn>
              <Btn sm v="ghost" onClick={()=>setSel({})}>Clear</Btn>
              {mayAdd&&<Btn sm v="primary" onClick={()=>setPreview(true)} style={{opacity:selectedCharges.length?1:0.5}}>Create Invoice ({selectedCharges.length}) · {money(selTotal)}</Btn>}
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead><tr style={{background:C.bg}}>{["","Type","Date","Customer","Container","Description","Qty","Rate","Amount"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map((c,i)=>(
                  <tr key={c.key} style={{background:sel[c.key]?C.amberD:(i%2?C.bg+"66":"transparent")}}>
                    <td style={s.td}><input type="checkbox" checked={!!sel[c.key]} onChange={e=>setSel(p=>({...p,[c.key]:e.target.checked}))}/></td>
                    <td style={s.td}><Tag label={c.group} color={GROUP_COLOR[c.group]||"slate"}/></td>
                    <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(c.date)}</td>
                    <td style={{...s.td,fontWeight:700}}>{cust(c.customerId)?.name}</td>
                    <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontSize:11.5}}>{c.container}</td>
                    <td style={{...s.td,fontSize:12}}>{c.desc}</td>
                    <td style={{...s.td,color:C.muted}}>{c.qty}</td>
                    <td style={{...s.td,fontSize:11,color:C.muted}}>{money(c.rate)}</td>
                    <td style={{...s.td,fontWeight:800,color:C.green}}>{money(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No unbilled charges. Receive inbound orders, accrue storage, or ship outbound orders to generate charges.</div>}
          </div>
        </div>
      )}

      {view==="invoices"&&(
        <div style={{...s.card,padding:0,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontWeight:800,fontSize:16,color:C.white}}>Invoices</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <select value={filterCust} onChange={e=>setFilterCust(e.target.value)} style={{...s.input,width:150}}><option value="">All Customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input value={searchC} onChange={e=>setSearchC(e.target.value)} placeholder="Search container / invoice #" style={{...s.input,width:190}}/>
              <Btn sm v="ghost" onClick={()=>exportExcel("invoices.xls","Invoices",invFiltered.map(i=>({Invoice:i.id,Customer:cust(i.customerId)?.name,Issued:i.issueDate,Due:i.dueDate,Terms:i.terms,Lines:i.lines.length,Total:i.total,Status:i.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead><tr style={{background:C.bg}}>{["Invoice #","Customer","Issued","Due","Terms","Lines","Total","Status","Actions"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {invFiltered.map((inv,i)=>(
                  <tr key={inv.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                    <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{inv.id}</td>
                    <td style={{...s.td,fontWeight:700}}>{cust(inv.customerId)?.name}</td>
                    <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(inv.issueDate)}</td>
                    <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(inv.dueDate)}</td>
                    <td style={{...s.td,fontSize:11}}>{inv.terms}</td>
                    <td style={{...s.td,color:C.muted}}>{inv.lines.length}</td>
                    <td style={{...s.td,fontWeight:800,color:C.green}}>{money(inv.total)}</td>
                    <td style={s.td}>{stTag(inv.status)}</td>
                    <td style={s.td}>
                      <div style={{display:"flex",gap:4}}>
                        <Btn sm v="ghost" onClick={()=>setViewInv(inv)} style={{color:C.blue,borderColor:C.blue+"55"}}>View</Btn>
                        <Btn sm v="ghost" onClick={()=>printInvoice(inv)}>Print</Btn>
                        {mayEdit&&<Btn sm v="ghost" onClick={()=>markPaid(inv.id)} style={{color:inv.status==="Paid"?C.orange:C.green,borderColor:(inv.status==="Paid"?C.orange:C.green)+"55"}}>{inv.status==="Paid"?"Unpay":"Mark Paid"}</Btn>}
                        {mayFull&&<Btn sm v="danger" onClick={()=>delInvoice(inv.id)}>Del</Btn>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No invoices yet. Select charges in the Unbilled tab to create one.</div>}
          </div>
        </div>
      )}

      {preview&&(
        <Modal title="Create Invoice" onClose={()=>setPreview(null)} wide>
          <div style={{fontSize:13,color:C.muted,marginBottom:14}}>{selectedCharges.length} charge(s) selected. One invoice will be created per customer.</div>
          <div style={{maxHeight:340,overflowY:"auto",marginBottom:16}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:C.bg}}>{["Customer","Type","Description","Amount"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{selectedCharges.map(c=>(
                <tr key={c.key}>
                  <td style={{...s.td,fontWeight:700}}>{cust(c.customerId)?.name}</td>
                  <td style={s.td}><Tag label={c.group} color={GROUP_COLOR[c.group]||"slate"}/></td>
                  <td style={{...s.td,fontSize:12}}>{c.desc}</td>
                  <td style={{...s.td,fontWeight:700,color:C.green}}>{money(c.amount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:C.input,borderRadius:8,marginBottom:16}}>
            <span style={{fontWeight:700,color:C.white}}>Total</span>
            <span style={{fontWeight:800,fontSize:20,color:C.green,fontFamily:"monospace"}}>{money(selTotal)}</span>
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={createInvoice}>Generate Invoice(s)</Btn><Btn onClick={()=>setPreview(null)}>Cancel</Btn></div>
        </Modal>
      )}

      {viewInv&&(
        <Modal title={`Invoice ${viewInv.id}`} onClose={()=>setViewInv(null)} wide>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:C.white}}>{cust(viewInv.customerId)?.name}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>{cust(viewInv.customerId)?.address}</div>
              <div style={{fontSize:12,color:C.muted}}>{cust(viewInv.customerId)?.email}</div>
            </div>
            <div style={{textAlign:"right",fontSize:12,color:C.muted}}>
              <div>Issued: <span style={{color:C.white}}>{fmtD(viewInv.issueDate)}</span></div>
              <div>Due: <span style={{color:C.white}}>{fmtD(viewInv.dueDate)}</span></div>
              <div>Terms: <span style={{color:C.white}}>{viewInv.terms}</span></div>
              <div style={{marginTop:6}}>{stTag(viewInv.status)}</div>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
            <thead><tr style={{background:C.bg}}>{["Type","Description","Qty","Rate","Amount"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{viewInv.lines.map((l,i)=>(
              <tr key={i}>
                <td style={s.td}><Tag label={l.group} color={GROUP_COLOR[l.group]||"slate"}/></td>
                <td style={{...s.td,fontSize:12}}>{l.desc}</td>
                <td style={{...s.td,color:C.muted}}>{l.qty}</td>
                <td style={{...s.td,fontSize:11,color:C.muted}}>{money(l.rate)}</td>
                <td style={{...s.td,fontWeight:700,color:C.green}}>{money(l.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:C.input,borderRadius:8,marginBottom:16}}>
            <span style={{fontWeight:700,color:C.white}}>TOTAL</span>
            <span style={{fontWeight:800,fontSize:22,color:C.green,fontFamily:"monospace"}}>{money(viewInv.total)}</span>
          </div>
          <div style={{display:"flex",gap:8}}><Btn v="primary" onClick={()=>printInvoice(viewInv)}>Print / PDF</Btn>{mayEdit&&<Btn v={viewInv.status==="Paid"?"default":"success"} onClick={()=>{markPaid(viewInv.id);setViewInv({...viewInv,status:viewInv.status==="Paid"?"Unpaid":"Paid"});}}>{viewInv.status==="Paid"?"Mark Unpaid":"Mark Paid"}</Btn>}<Btn onClick={()=>setViewInv(null)}>Close</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// CUSTOMER PORTAL - what a logged-in customer sees
// ============================================================
function CustomerPortal({customer,ledger,orders}){
  const[tab,setTab]=useState("inventory");
  const[search,setSearch]=useState("");
  const balOf=(l)=>{const o=(l.movements||[]).reduce((a,m)=>({p:a.p+(m.outPlts||0),u:a.u+(m.outUnits||0)}),{p:0,u:0});return {plts:l.inPlts-o.p,units:l.inUnits-o.u};};
  const myLedger=ledger.filter(l=>l.customerId===customer.id);
  const myIn=orders.filter(o=>o.customerId===customer.id&&o.type==="IN");
  const myOut=orders.filter(o=>o.customerId===customer.id&&o.type==="OUT");
  const balPlts=myLedger.reduce((a,l)=>a+balOf(l).plts,0);
  const balUnits=myLedger.reduce((a,l)=>a+balOf(l).units,0);
  const sfilt=(arr,fields)=>arr.filter(x=>!search||fields.map(f=>x[f]).join(" ").toLowerCase().includes(search.toLowerCase()));

  const invRows=sfilt(myLedger,["containerNo","sku","description","warehouseCode"]);
  const inRows=sfilt(myIn,["containerNo","sku","reference","ttsPo"]);
  const outRows=sfilt(myOut,["containerNo","sku","reference"]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        <KPI label="My SKUs on Hand" value={myLedger.length} color={C.blue}/>
        <KPI label="Balance Pallets" value={num(balPlts)} color={C.amber}/>
        <KPI label="Balance Units" value={num(balUnits)} color={C.green}/>
        <KPI label="Inbound / Outbound" value={myIn.length+" / "+myOut.length} color={C.teal}/>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:0}}>
          {[["inventory","Inventory On Hand"],["inbound","Inbound"],["outbound","Outbound"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>{setTab(id);setSearch("");}} style={{background:"none",border:"none",cursor:"pointer",padding:"10px 20px",fontSize:13,fontWeight:tab===id?700:500,color:tab===id?C.amber:C.muted,borderBottom:`2px solid ${tab===id?C.amber:"transparent"}`,marginBottom:-1}}>{lbl}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",paddingBottom:6}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search container / SKU" style={{...s.input,width:190}}/>
          {tab==="inventory"&&<Btn sm v="ghost" onClick={()=>exportExcel("my_inventory.xls","Inventory",invRows.map(l=>{const b=balOf(l);return{Container:l.containerNo,SKU:l.sku,Description:l.description,Location:l.warehouseCode,IB_Date:l.ibDate,In_Units:l.inUnits,Bal_Pallets:b.plts,Bal_Units:b.units};}))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>}
          {tab==="inbound"&&<Btn sm v="ghost" onClick={()=>exportExcel("my_inbound.xls","Inbound",inRows.map(o=>({Submitted:o.submitted,ETA:o.eta,Container:o.containerNo,SKU:o.sku,Plts:o.plts,Units:o.units,Reference:o.reference,Status:o.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>}
          {tab==="outbound"&&<Btn sm v="ghost" onClick={()=>exportExcel("my_outbound.xls","Outbound",outRows.map(o=>({Submitted:o.submitted,ETD:o.etd,Container:o.containerNo,SKU:o.sku,Plts:o.plts,Units:o.units,Reference:o.reference,Shipping:o.shipMode,Status:o.status})))} style={{color:C.green,borderColor:C.green+"55"}}>Export Excel</Btn>}
        </div>
      </div>

      {tab==="inventory"&&(
        <div style={{...s.card,padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
              <thead><tr style={{background:C.bg}}>{["Container #","SKU","Description","Location","IB Date","In Units","Bal Plts","Bal Units"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{invRows.map((l,i)=>{const b=balOf(l);return(
                <tr key={l.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                  <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{l.containerNo}</td>
                  <td style={{...s.td,fontWeight:700}}>{l.sku}</td>
                  <td style={{...s.td,color:C.muted}}>{l.description}</td>
                  <td style={{...s.td,fontSize:11,color:C.teal,fontFamily:"monospace"}}>{l.warehouseCode}</td>
                  <td style={{...s.td,fontSize:11,color:C.green}}>{fmtD(l.ibDate)}</td>
                  <td style={{...s.td}}>{num(l.inUnits)}</td>
                  <td style={{...s.td,fontWeight:800,color:C.amber}}>{b.plts}</td>
                  <td style={{...s.td,fontWeight:800,color:C.amber}}>{num(b.units)}</td>
                </tr>
              );})}</tbody>
            </table>
            {invRows.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No inventory on file.</div>}
          </div>
        </div>
      )}

      {tab==="inbound"&&(
        <div style={{...s.card,padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
              <thead><tr style={{background:C.bg}}>{["Submitted","ETA","Container #","SKU","Description","Plts","Units","Reference","Status"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{inRows.map((o,i)=>(
                <tr key={o.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                  <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(o.submitted)}</td>
                  <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(o.eta)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{o.containerNo}</td>
                  <td style={{...s.td,fontWeight:700}}>{o.sku}</td>
                  <td style={{...s.td,color:C.muted}}>{o.description}</td>
                  <td style={{...s.td,color:C.teal,fontWeight:700}}>{o.plts}</td>
                  <td style={s.td}>{num(o.units)}</td>
                  <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{o.reference||"-"}</td>
                  <td style={s.td}>{stTag(o.status)}</td>
                </tr>
              ))}</tbody>
            </table>
            {inRows.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No inbound orders.</div>}
          </div>
        </div>
      )}

      {tab==="outbound"&&(
        <div style={{...s.card,padding:0,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
              <thead><tr style={{background:C.bg}}>{["Submitted","ETD","Container #","SKU","Description","Plts","Units","Reference","Shipping","Status"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{outRows.map((o,i)=>(
                <tr key={o.id} style={{background:i%2?C.bg+"66":"transparent"}}>
                  <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(o.submitted)}</td>
                  <td style={{...s.td,fontSize:11,color:C.muted}}>{fmtD(o.etd)}</td>
                  <td style={{...s.td,fontFamily:"monospace",color:C.amber,fontWeight:700}}>{o.containerNo}</td>
                  <td style={{...s.td,fontWeight:700}}>{o.sku}</td>
                  <td style={{...s.td,color:C.muted}}>{o.description}</td>
                  <td style={{...s.td,color:C.teal,fontWeight:700}}>{o.plts}</td>
                  <td style={s.td}>{num(o.units)}</td>
                  <td style={{...s.td,fontSize:11,fontFamily:"monospace"}}>{o.reference||"-"}</td>
                  <td style={s.td}>{o.shipMode?<Tag label={o.shipMode} color="blue"/>:"-"}</td>
                  <td style={s.td}>{stTag(o.status)}</td>
                </tr>
              ))}</tbody>
            </table>
            {outRows.length===0&&<div style={{padding:"40px",textAlign:"center",color:C.muted}}>No outbound orders.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LOGIN SCREEN
// ============================================================
function Login({onStaff,onCustomer,customers,users,adminPass}){
  const[u,setU]=useState("");
  const[p,setP]=useState("");
  const[showPw,setShowPw]=useState(false);
  const[err,setErr]=useState("");
  const submit=()=>{
    // admin
    if(u==="Marie"&&p===adminPass){onStaff({name:"Marie",role:"admin",username:"Marie"});return;}
    // staff
    const staff=users.find(x=>x.username===u&&x.password===p&&x.active);
    if(staff){onStaff({name:staff.name,role:staff.role,username:staff.username,permissions:staff.permissions||{},allowedWarehouses:staff.allowedWarehouses||[]});return;}
    // customer
    const c=customers.find(x=>x.portalUser===u&&x.portalPass===p&&x.status==="Active");
    if(c){onCustomer(c);return;}
    setErr("Invalid username or password.");
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}>
      <div style={{width:400,background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"40px 44px",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{fontSize:26,fontWeight:900,color:C.amber,letterSpacing:"0.01em"}}>Trucking 2000 WMS</div>
          <div style={{fontSize:11,color:C.muted,letterSpacing:"0.14em",textTransform:"uppercase",marginTop:6}}>Warehouse Portal</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:18}}>
          <TI id="login-username" label="Username" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} autoComplete="username"/>
          <div style={{display:"flex",flexDirection:"column"}}>
            <label htmlFor="login-password" style={s.label}>Password</label>
            <div style={{position:"relative"}}>
              <input id="login-password" type={showPw?"text":"password"} value={p}
                onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
                autoComplete="current-password"
                style={{...s.input,position:"relative",zIndex:1,paddingRight:70}}/>
              <button type="button" onClick={()=>setShowPw(v=>!v)}
                aria-label={showPw?"Hide password":"Show password"}
                style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",zIndex:2,
                  background:"none",border:"none",cursor:"pointer",color:showPw?C.amber:C.muted,
                  fontSize:11,fontWeight:700,letterSpacing:"0.04em",padding:"4px 6px"}}>
                {showPw?"HIDE":"SHOW"}
              </button>
            </div>
          </div>
          {err&&<div style={{background:C.redD,border:`1px solid ${C.red}44`,borderRadius:6,padding:"8px 12px",fontSize:12,color:C.red}}>{err}</div>}
        </div>
        <Btn v="primary" onClick={submit} style={{width:"100%"}}>Sign In</Btn>
      </div>
    </div>
  );
}

// ============================================================
// APP SHELL
// ============================================================
// ============================================================
// DASHBOARD - at-a-glance operations + billing overview
// ============================================================
function Dashboard({orders,ledger,customers,invoices,activity,warehouses,setTab}){
  const cust=(id)=>customers.find(c=>c.id===id);
  const balOf=(l)=>{const o=(l.movements||[]).reduce((a,m)=>({p:a.p+(m.outPlts||0),u:a.u+(m.outUnits||0)}),{p:0,u:0});return {plts:l.inPlts-o.p,units:l.inUnits-o.u};};

  // Operations metrics
  const inbound=orders.filter(o=>o.type==="IN"&&o.status!=="Received"&&o.status!=="Cancelled");
  const outbound=orders.filter(o=>o.type==="OUT"&&o.status!=="Shipped"&&o.status!=="Cancelled");
  const awaitingIn=inbound.filter(o=>o.status==="Submitted").length;
  const awaitingOut=outbound.filter(o=>o.status==="Submitted").length;
  const scheduledIn=inbound.filter(o=>o.status==="Scheduled").length;
  const scheduledOut=outbound.filter(o=>o.status==="Scheduled").length;

  // Inventory metrics
  const activeLedger=ledger.filter(l=>balOf(l).units>0||balOf(l).plts>0);
  const totalBalPlts=ledger.reduce((a,l)=>a+balOf(l).plts,0);
  const totalBalUnits=ledger.reduce((a,l)=>a+balOf(l).units,0);

  // Billing metrics
  const unpaid=invoices.filter(i=>i.status==="Unpaid");
  const totalUnpaid=unpaid.reduce((a,i)=>a+i.total,0);
  const totalPaid=invoices.filter(i=>i.status==="Paid").reduce((a,i)=>a+i.total,0);
  const overdue=unpaid.filter(i=>i.dueDate&&i.dueDate<today.toISOString().split("T")[0]);
  const totalOverdue=overdue.reduce((a,i)=>a+i.total,0);

  // rate lookup for storage alerts
  const rateFor=(customerId,date)=>{
    const c=cust(customerId); if(!c)return null;
    const sheets=(c.quoteSheets||[]).filter(q=>q.status==="Active");
    const d=date||today.toISOString().split("T")[0];
    return (sheets.find(q=>(!q.effectiveDate||q.effectiveDate<=d)&&(!q.expiryDate||q.expiryDate>=d))||sheets[0])?.rates||null;
  };
  // Aging inventory past free days (receiving day counts as day 1)
  const agingAlerts=ledger.map(l=>{
    const r=rateFor(l.customerId,l.ibDate);
    const free=r?.freeDays||0;
    const days=aging(l.ibDate)+1;
    const b=balOf(l);
    return {l,days,free,over:days-free,bal:b};
  }).filter(x=>(x.bal.units>0||x.bal.plts>0)&&x.over>0).sort((a,b)=>b.over-a.over);

  // Per-warehouse stock
  const whStock={};
  ledger.forEach(l=>{const b=balOf(l);whStock[l.warehouseCode]=whStock[l.warehouseCode]||{plts:0,units:0};whStock[l.warehouseCode].plts+=b.plts;whStock[l.warehouseCode].units+=b.units;});

  // Per-customer stock
  const custStock={};
  ledger.forEach(l=>{const b=balOf(l);custStock[l.customerId]=custStock[l.customerId]||{plts:0,units:0,skus:0};custStock[l.customerId].plts+=b.plts;custStock[l.customerId].units+=b.units;custStock[l.customerId].skus+=1;});

  const card={...s.card};
  const link=(t)=>({cursor:"pointer"});

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {/* Top KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        <div onClick={()=>setTab("inbound")} style={{...card,padding:"18px 20px",cursor:"pointer",borderLeft:`3px solid ${C.blue}`}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>Open Inbound</div>
          <div style={{fontSize:30,fontWeight:800,color:C.blue,fontFamily:"monospace",margin:"6px 0"}}>{inbound.length}</div>
          <div style={{fontSize:11,color:C.muted}}>{awaitingIn} awaiting · {scheduledIn} scheduled</div>
        </div>
        <div onClick={()=>setTab("outbound")} style={{...card,padding:"18px 20px",cursor:"pointer",borderLeft:`3px solid ${C.orange}`}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>Open Outbound</div>
          <div style={{fontSize:30,fontWeight:800,color:C.orange,fontFamily:"monospace",margin:"6px 0"}}>{outbound.length}</div>
          <div style={{fontSize:11,color:C.muted}}>{awaitingOut} awaiting · {scheduledOut} scheduled</div>
        </div>
        <div onClick={()=>setTab("inventory")} style={{...card,padding:"18px 20px",cursor:"pointer",borderLeft:`3px solid ${C.amber}`}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>On Hand</div>
          <div style={{fontSize:30,fontWeight:800,color:C.amber,fontFamily:"monospace",margin:"6px 0"}}>{num(totalBalPlts)}<span style={{fontSize:14,color:C.muted}}> plt</span></div>
          <div style={{fontSize:11,color:C.muted}}>{num(totalBalUnits)} units · {activeLedger.length} active SKUs</div>
        </div>
        <div onClick={()=>setTab("billing")} style={{...card,padding:"18px 20px",cursor:"pointer",borderLeft:`3px solid ${C.red}`}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase"}}>Outstanding A/R</div>
          <div style={{fontSize:30,fontWeight:800,color:C.red,fontFamily:"monospace",margin:"6px 0"}}>{money(totalUnpaid)}</div>
          <div style={{fontSize:11,color:overdue.length?C.red:C.muted}}>{overdue.length?`${overdue.length} overdue · ${money(totalOverdue)}`:"none overdue"}</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {/* Aging inventory alerts */}
        <div style={{...card,padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:800,fontSize:14,color:C.white}}>⏳ Aging Inventory (past free days)</div>
            <Tag label={agingAlerts.length+" alerts"} color={agingAlerts.length?"orange":"green"}/>
          </div>
          <div style={{maxHeight:280,overflowY:"auto"}}>
            {agingAlerts.length===0&&<div style={{padding:"30px",textAlign:"center",color:C.muted,fontSize:13}}>No inventory past free days. ✓</div>}
            {agingAlerts.slice(0,12).map((x,i)=>(
              <div key={x.l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",borderBottom:`1px solid ${C.borderL}`,background:i%2?C.bg+"44":"transparent"}}>
                <div>
                  <div style={{fontSize:12.5,fontWeight:700}}>{cust(x.l.customerId)?.name}<span style={{color:C.muted,fontWeight:400}}> · {x.l.containerNo}</span></div>
                  <div style={{fontSize:10.5,color:C.muted}}>{x.l.sku} · {x.bal.plts} plt / {num(x.bal.units)} u · {x.l.warehouseCode}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:800,color:x.over>30?C.red:x.over>14?C.orange:C.amber,fontFamily:"monospace"}}>{x.over}d</div>
                  <div style={{fontSize:10,color:C.muted}}>over {x.free}d free</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{...card,padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:800,fontSize:14,color:C.white}}>📋 Recent Activity</div>
            <button onClick={()=>setTab("activity")} style={{background:"none",border:"none",color:C.amber,cursor:"pointer",fontSize:12,fontWeight:700}}>View all →</button>
          </div>
          <div style={{maxHeight:280,overflowY:"auto"}}>
            {activity.length===0&&<div style={{padding:"30px",textAlign:"center",color:C.muted,fontSize:13}}>No activity yet. Confirm or receive an order to start.</div>}
            {activity.slice(0,12).map((a,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 18px",borderBottom:`1px solid ${C.borderL}`,background:i%2?C.bg+"44":"transparent"}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:10.5,color:C.muted,fontFamily:"monospace"}}>{a.ts?.slice(5)}</span>
                  <span style={{fontSize:12.5}}><span style={{fontWeight:700}}>{a.action}</span>{a.detail?<span style={{color:C.muted}}> · {a.detail}</span>:null}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
        {/* Stock by warehouse */}
        <div style={{...card,padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,fontWeight:800,fontSize:14,color:C.white}}>🏢 Stock by Warehouse</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.bg}}>{["Warehouse","Bal Pallets","Bal Units"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {Object.keys(whStock).length===0&&<tr><td colSpan={3} style={{...s.td,textAlign:"center",color:C.muted}}>No stock.</td></tr>}
              {Object.keys(whStock).map(wc=>(
                <tr key={wc}>
                  <td style={{...s.td,fontFamily:"monospace",color:C.teal,fontWeight:700}}>{wc}</td>
                  <td style={{...s.td,fontWeight:700,color:C.amber}}>{num(whStock[wc].plts)}</td>
                  <td style={{...s.td,fontWeight:700}}>{num(whStock[wc].units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stock by customer */}
        <div style={{...card,padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,fontWeight:800,fontSize:14,color:C.white}}>👥 Stock by Customer</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:C.bg}}>{["Customer","SKUs","Bal Pallets","Bal Units"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {Object.keys(custStock).length===0&&<tr><td colSpan={4} style={{...s.td,textAlign:"center",color:C.muted}}>No stock.</td></tr>}
              {Object.keys(custStock).map(cid=>(
                <tr key={cid}>
                  <td style={{...s.td,fontWeight:700}}>{cust(cid)?.name||cid}</td>
                  <td style={{...s.td,color:C.muted}}>{custStock[cid].skus}</td>
                  <td style={{...s.td,fontWeight:700,color:C.amber}}>{num(custStock[cid].plts)}</td>
                  <td style={{...s.td,fontWeight:700}}>{num(custStock[cid].units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Billing summary strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        <div style={{...card,padding:"16px 20px"}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}>Collected (Paid)</div>
          <div style={{fontSize:22,fontWeight:800,color:C.green,fontFamily:"monospace",marginTop:4}}>{money(totalPaid)}</div>
        </div>
        <div style={{...card,padding:"16px 20px"}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}>Outstanding</div>
          <div style={{fontSize:22,fontWeight:800,color:C.red,fontFamily:"monospace",marginTop:4}}>{money(totalUnpaid)}</div>
        </div>
        <div style={{...card,padding:"16px 20px"}}>
          <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}>Total Invoices</div>
          <div style={{fontSize:22,fontWeight:800,color:C.blue,fontFamily:"monospace",marginTop:4}}>{invoices.length}</div>
        </div>
      </div>
    </div>
  );
}

function WMSApp({initial, onSave, cloudStatus, onReload}){
  const[orders,setOrders]=useState(initial.orders);
  const[ledger,setLedger]=useState(initial.ledger);
  const[customers,setCustomers]=useState(initial.customers);
  const[warehouses,setWarehouses]=useState(initial.warehouses);
  const[carriers,setCarriers]=useState(initial.carriers);
  const[users,setUsers]=useState(initial.users);
  const[activity,setActivity]=useState(initial.activity);
  const[invoices,setInvoices]=useState(initial.invoices);
  const[templates,setTemplates]=useState(initial.templates);
  const[adminPass,setAdminPass]=useState("11861186");

  // Persist each collection to Supabase when it changes (skip the very first render).
  const firstRun=useRef(true);
  useEffect(()=>{ if(firstRun.current)return; onSave("orders",orders); },[orders]);
  useEffect(()=>{ if(firstRun.current)return; onSave("ledger",ledger); },[ledger]);
  useEffect(()=>{ if(firstRun.current)return; onSave("customers",customers); },[customers]);
  useEffect(()=>{ if(firstRun.current)return; onSave("warehouses",warehouses); },[warehouses]);
  useEffect(()=>{ if(firstRun.current)return; onSave("carriers",carriers); },[carriers]);
  useEffect(()=>{ if(firstRun.current)return; onSave("users",users); },[users]);
  useEffect(()=>{ if(firstRun.current)return; onSave("activity",activity); },[activity]);
  useEffect(()=>{ if(firstRun.current)return; onSave("invoices",invoices); },[invoices]);
  useEffect(()=>{ if(firstRun.current)return; onSave("templates",templates); },[templates]);
  useEffect(()=>{ firstRun.current=false; },[]);

  const[session,setSession]=useState(null); // {kind:'staff'|'customer', ...}
  const[tab,setTab]=useState("dashboard");

  const logActivity=(action,detail,customerId,warehouseCode)=>{
    const who=session?(session.kind==="customer"?(session.customer?.portalUser||"customer"):(session.username||session.name||"staff")):"system";
    setActivity(p=>[{ts:fmtDT(new Date()),action,detail,customerId,warehouseCode,user:who},...p]);
  };

  const isAdmin=session?.kind==="staff"&&session.role==="admin";

  if(!session){
    return <Login customers={customers} users={users} adminPass={adminPass}
      onStaff={(u)=>{setSession({kind:"staff",...u});setTab("dashboard");}}
      onCustomer={(c)=>{setSession({kind:"customer",customer:c});}}/>;
  }

  // Customer portal view
  if(session.kind==="customer"){
    return(
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.white}}>
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"0 24px"}}>
          <div style={{maxWidth:1400,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{background:C.greenD,color:C.green,border:`1px solid ${C.green}44`,borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:700}}>● PORTAL</span>
              <span style={{fontWeight:800}}>{session.customer.name}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:12,color:C.muted}}>{session.customer.portalUser}</span>
              <Btn sm v="ghost" onClick={()=>setSession(null)}>Sign Out</Btn>
            </div>
          </div>
        </div>
        <div style={{maxWidth:1400,margin:"0 auto",padding:"28px 24px"}}>
          <CustomerPortal customer={session.customer} ledger={ledger} orders={orders}/>
        </div>
      </div>
    );
  }

  // Staff/Admin portal view
  const ALL_TABS=[
    {id:"dashboard",label:"Dashboard"},
    {id:"inbound",label:"Inbound"},
    {id:"outbound",label:"Outbound"},
    {id:"history",label:"History"},
    {id:"inventory",label:"Inventory"},
    {id:"activity",label:"Activity Log"},
    {id:"billing",label:"Billing"},
    {id:"customers",label:"Customers"},
    {id:"carriers",label:"Carriers"},
    {id:"warehouses",label:"Warehouses"},
  ];
  const perms=session.permissions||{};
  const permOf=(sec)=>isAdmin?"full":(perms[sec]||"none");
  const TABS=[
    ...ALL_TABS.filter(t=>isAdmin||canView(permOf(t.id))),
    ...(isAdmin?[{id:"users",label:"Users"}]:[]),
  ];
  // filter data to allowed warehouses for warehouse-scoped users
  const whScope=(!isAdmin&&session.allowedWarehouses&&session.allowedWarehouses.length>0)?session.allowedWarehouses:null;
  const scopedOrders=whScope?orders.filter(o=>whScope.includes(o.warehouseCode)):orders;
  const scopedLedger=whScope?ledger.filter(l=>whScope.includes(l.warehouseCode)):ledger;
  const scopedWarehouses=whScope?warehouses.filter(w=>whScope.includes(w.code)):warehouses;

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.white}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1400,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,paddingRight:20,borderRight:`1px solid ${C.border}`,marginRight:16}}>
            <div><div style={{fontSize:15,fontWeight:900,color:C.amber,letterSpacing:"0.02em"}}>Trucking 2000 WMS</div><div style={{fontSize:9,color:C.muted}}>Warehouse Portal</div></div>
          </div>
          <div style={{display:"flex",overflowX:"auto",flex:1}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",cursor:"pointer",padding:"18px 16px",fontSize:12.5,fontWeight:tab===t.id?700:500,color:tab===t.id?C.amber:C.muted,borderBottom:`2px solid ${tab===t.id?C.amber:"transparent"}`,whiteSpace:"nowrap"}}>{t.label}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,marginLeft:12}}>
            <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:700}}>{session.name}</div><div style={{fontSize:10,color:isAdmin?C.amber:C.muted}}>{isAdmin?"Administrator":session.role==="warehouse"?"Warehouse":"Staff"}</div></div>
            {isAdmin&&<span style={{background:C.amberD,border:`1px solid ${C.amberB}`,color:C.amber,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:12}}>ADMIN</span>}
            {session.role==="warehouse"&&<span style={{background:C.tealD,border:`1px solid ${C.teal}44`,color:C.teal,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:12}}>{(session.allowedWarehouses||[])[0]||"WAREHOUSE"}</span>}
            <span title={cloudStatus==="error"?"Not connected to database — changes may not be saved":"Saved to cloud"} style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:12,background:cloudStatus==="saving"?C.amberD:cloudStatus==="error"?C.redD:C.tealD,color:cloudStatus==="saving"?C.amber:cloudStatus==="error"?C.red:C.teal,border:`1px solid ${(cloudStatus==="saving"?C.amber:cloudStatus==="error"?C.red:C.teal)}44`}}>{cloudStatus==="saving"?"Saving…":cloudStatus==="error"?"● Offline":"● Cloud"}</span>
            {onReload&&<Btn sm v="ghost" onClick={onReload} title="Reload latest data from the database">Refresh</Btn>}
            <Btn sm v="ghost" onClick={()=>setSession(null)}>Sign Out</Btn>
          </div>
        </div>
      </div>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"28px 24px"}}>
        {!canView(permOf(tab))&&tab!=="users"&&(
          <div style={{...s.card,textAlign:"center",padding:"50px",color:C.muted}}>You don't have access to this section. Contact your administrator.</div>
        )}
        {tab==="dashboard"&&canView(permOf("dashboard"))&&<Dashboard orders={scopedOrders} ledger={scopedLedger} customers={customers} invoices={invoices} activity={activity} warehouses={scopedWarehouses} setTab={setTab}/>}
        {tab==="inbound"&&canView(permOf("inbound"))&&<Inbound orders={scopedOrders} setOrders={setOrders} customers={customers} warehouses={scopedWarehouses} isAdmin={isAdmin} perm={permOf("inbound")} logActivity={logActivity} setLedger={setLedger} ledger={scopedLedger} invoices={invoices} templates={templates} setTemplates={setTemplates}/>}
        {tab==="outbound"&&canView(permOf("outbound"))&&<Outbound orders={scopedOrders} setOrders={setOrders} customers={customers} warehouses={scopedWarehouses} carriers={carriers} ledger={scopedLedger} setLedger={setLedger} isAdmin={isAdmin} perm={permOf("outbound")} role={session.role} logActivity={logActivity} invoices={invoices} templates={templates} setTemplates={setTemplates}/>}
        {tab==="history"&&canView(permOf("history"))&&<History orders={scopedOrders} customers={customers} warehouses={scopedWarehouses}/>}
        {tab==="inventory"&&canView(permOf("inventory"))&&<InventoryLedger ledger={scopedLedger} customers={customers} warehouses={scopedWarehouses}/>}
        {tab==="activity"&&canView(permOf("activity"))&&<ActivityLog activity={activity} customers={customers} warehouses={scopedWarehouses}/>}
        {tab==="billing"&&canView(permOf("billing"))&&<BillingModule orders={orders} ledger={ledger} customers={customers} invoices={invoices} setInvoices={setInvoices} isAdmin={isAdmin} perm={permOf("billing")} logActivity={logActivity}/>}
        {tab==="customers"&&canView(permOf("customers"))&&<CustomerMgmt customers={customers} setCustomers={setCustomers} isAdmin={isAdmin} perm={permOf("customers")}/>}
        {tab==="carriers"&&canView(permOf("carriers"))&&<CarrierMgmt carriers={carriers} setCarriers={setCarriers} isAdmin={isAdmin} perm={permOf("carriers")}/>}
        {tab==="warehouses"&&canView(permOf("warehouses"))&&<WarehouseMgmt warehouses={warehouses} setWarehouses={setWarehouses} isAdmin={isAdmin} perm={permOf("warehouses")}/>}
        {tab==="users"&&isAdmin&&<UserMgmt users={users} setUsers={setUsers} warehouses={warehouses}/>}
      </div>
    </div>
  );
}

// ============================================================
// Cloud loader wrapper — loads data from Supabase, seeds defaults
// on first run, and saves changes back (debounced per collection).
// ============================================================
const DEFAULTS = {
  orders: [], ledger: [], customers: [],
  warehouses: [], carriers: [],
  users: [{id:"U-MARIE",username:"Marie",password:"11861186",name:"Marie",role:"admin",active:true,permissions:{},allowedWarehouses:[]}],
  activity: [], invoices: [], templates: [],
};

export default function App(){
  const [initial, setInitial] = useState(null);   // null = loading
  const [status, setStatus] = useState("idle");     // idle | saving | error
  const [loadError, setLoadError] = useState(null);
  const saveTimers = useRef({});

  // Dark-theme styling for native date pickers (calendar popup + icon).
  // Injected here so it applies even if index.html isn't updated.
  useEffect(() => {
    const id="t2-datepicker-style";
    if(document.getElementById(id))return;
    const el=document.createElement("style");
    el.id=id;
    el.textContent=`
      input[type="date"],input[type="datetime-local"],input[type="month"],input[type="time"]{color-scheme:dark;color:#e2eaf4;}
      input[type="date"]::-webkit-calendar-picker-indicator,
      input[type="datetime-local"]::-webkit-calendar-picker-indicator,
      input[type="month"]::-webkit-calendar-picker-indicator,
      input[type="time"]::-webkit-calendar-picker-indicator{
        filter:invert(70%) sepia(85%) saturate(1400%) hue-rotate(2deg) brightness(103%) contrast(96%);
        opacity:1;cursor:pointer;padding:2px;border-radius:3px;
      }
      input[type="date"]::-webkit-calendar-picker-indicator:hover{background:rgba(245,158,11,0.18);}
      input[type="date"]::-webkit-datetime-edit-text,
      input[type="date"]::-webkit-datetime-edit-month-field,
      input[type="date"]::-webkit-datetime-edit-day-field,
      input[type="date"]::-webkit-datetime-edit-year-field{color:#e2eaf4;}
    `;
    document.head.appendChild(el);
  }, []);

  const boot = async () => {
    setInitial(null); setLoadError(null);
    const res = await loadAll();
    if (!res.ok) {
      // Could not reach the database. Show a clear error rather than a blank screen.
      setLoadError(res.error);
      return;
    }
    const data = {};
    let seededAny = false;
    for (const key of COLLECTIONS) {
      if (res.data[key] === undefined) {
        data[key] = DEFAULTS[key];        // never saved before → seed defaults
        seededAny = true;
      } else {
        data[key] = res.data[key];
      }
    }
    setInitial(data);
    // Persist any freshly-seeded collections so the DB has a starting point.
    if (seededAny) {
      for (const key of COLLECTIONS) {
        if (res.data[key] === undefined) saveCollection(key, data[key]);
      }
    }
  };

  useEffect(() => { boot(); }, []);

  // Debounced save so rapid edits collapse into one write per collection.
  const handleSave = (key, rows) => {
    setStatus("saving");
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      const r = await saveCollection(key, rows);
      setStatus(r.ok ? "idle" : "error");
    }, 600);
  };

  const wrap = (msg, sub) => (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080f18",color:"#e2eaf4",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{textAlign:"center",maxWidth:440,padding:24}}>
        <div style={{fontSize:22,fontWeight:900,color:"#f59e0b",marginBottom:10}}>Trucking 2000 WMS</div>
        <div style={{fontSize:14,color:"#9fb2c8"}}>{msg}</div>
        {sub}
      </div>
    </div>
  );

  if (loadError) {
    return wrap("Could not connect to the database.", (
      <div style={{marginTop:14}}>
        <div style={{fontSize:12,color:"#ef4444",marginBottom:14,fontFamily:"monospace",wordBreak:"break-word"}}>{loadError}</div>
        <button onClick={boot} style={{background:"#f59e0b",color:"#08111c",border:"none",borderRadius:8,padding:"10px 20px",fontWeight:700,cursor:"pointer"}}>Try again</button>
      </div>
    ));
  }
  if (!initial) return wrap("Loading your data…");

  return <WMSApp initial={initial} onSave={handleSave} cloudStatus={status} onReload={boot} />;
}
