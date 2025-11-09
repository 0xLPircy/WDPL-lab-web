import React, { useEffect, useState } from 'react';
import { X, Plus, Edit2, RefreshCw } from 'lucide-react';

const COLLECTORS = ["Raju", "Ranganna", "Arjun", "Rocky", "Jagga", "Farm"];
const ALCOHOL_OPS = ["+ve", "-ve", "NA"];
const STORAGE_KEYS = {
  COLLECTIONS: "collections",
  DEDUCTIONS: "deductions",
  BATCHES: "batches",
  PENDING_SYNC: "pending_sync",
  LAST_SYNC: "last_sync",
};

const SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbzJdhpHD8FRDGH4xSmi737pB5E_yy257qLB8MwtUPutevk8yJcKgp30j0H0yZjfmQ_8ig/exec";

export default function App() {
  const [collections, setCollections] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [batches, setBatches] = useState({});
  const [pendingSync, setPendingSync] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState("collections");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [loader, setLoader] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [formData, setFormData] = useState({
    collectorName: COLLECTORS[0],
    arrivalTime: new Date().toTimeString().slice(0, 5),
    quantity: "",
    CLR: "",
    FAT: "",
    SNF: "",
    water: "",
    alcohol: ALCOHOL_OPS[2],
    MBRT: "",
    Batch: "",
  });

  const [deductionForm, setDeductionForm] = useState({
    reason: "",
    quantity: "",
  });

  useEffect(() => {
    initializeApp();
    
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingData();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializeApp = async () => {
    setLoader(true);
    await loadLocalData();
    const needsSync = await checkIfNeedsSync();
    if (needsSync) {
      await fetchFromSheets();
    }
    setLoader(false);
  };

  const checkIfNeedsSync = async () => {
    try {
      const pending = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_SYNC) || "[]");
      return pending.length === 0 && isOnline;
    } catch (error) {
      console.error("Error checking sync status:", error);
      return false;
    }
  };

  const fetchFromSheets = async () => {
    if (!isOnline) return;

    try {
      const response = await fetch(SHEETS_API_URL, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success) {
          const fetchedCollections = data.collections.map((c) => ({
            BUID: c.BUID || c["BUID"],
            collectorName: c["Collector Name"] || c.collectorName,
            arrivalTime: c["Arrival Time"] || c.arrivalTime,
            quantity: parseFloat(c.Quantity || c.quantity || 0),
            CLR: parseFloat(c.CLR || -1),
            FAT: parseFloat(c.FAT || -1),
            SNF: parseFloat(c.SNF || -1),
            water: parseFloat(c.Water || c.water || -1),
            alcohol: c.Alcohol || c.alcohol || "NA",
            MBRT: parseFloat(c.MBRT || -1),
            Batch: c.Batch || "",
            timestamp: c.Timestamp || c.timestamp,
          }));

          const fetchedDeductions = data.deductions.map((d) => ({
            id: d.ID || d.id,
            batch: d.Batch || d.batch,
            reason: d.Reason || d.reason,
            quantity: parseFloat(d.Quantity || d.quantity || 0),
            timestamp: d.Timestamp || d.timestamp,
          }));

          const fetchedBatches = {};
          data.batches.forEach((b) => {
            const batchName = b["Batch Name"] || b.batch;
            const dispatched =
              (b.Dispatched || b.dispatched) === "YES" ||
              (b.Dispatched || b.dispatched) === true;
            fetchedBatches[batchName] = { dispatched };
          });

          setCollections(fetchedCollections);
          setDeductions(fetchedDeductions);
          setBatches(fetchedBatches);

          localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(fetchedCollections));
          localStorage.setItem(STORAGE_KEYS.DEDUCTIONS, JSON.stringify(fetchedDeductions));
          localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(fetchedBatches));
          localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
        }
      }
    } catch (error) {
      console.error("Error fetching from sheets:", error);
    }
  };

  const loadLocalData = async () => {
    try {
      const collectionsData = localStorage.getItem(STORAGE_KEYS.COLLECTIONS);
      const deductionsData = localStorage.getItem(STORAGE_KEYS.DEDUCTIONS);
      const batchesData = localStorage.getItem(STORAGE_KEYS.BATCHES);
      const pendingData = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC);

      if (collectionsData) setCollections(JSON.parse(collectionsData));
      if (deductionsData) setDeductions(JSON.parse(deductionsData));
      if (batchesData) setBatches(JSON.parse(batchesData));
      if (pendingData) setPendingSync(JSON.parse(pendingData));
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const generateBUID = () => {
    const now = new Date();
    return `BUID${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}${String(now.getMilliseconds()).padStart(3, "0")}`;
  };

  const formatTime = (timeStr) => {
    if (timeStr.includes(':')) return timeStr;
    return new Date(timeStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleAddCollection = async () => {
    if (!formData.quantity || !formData.Batch) {
      alert("Please fill quantity and batch fields");
      return;
    }

    const now = new Date();
    const [hours, minutes] = formData.arrivalTime.split(':');
    const arrivalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));

    const newCollection = {
      BUID: generateBUID(),
      collectorName: formData.collectorName,
      arrivalTime: arrivalDate.toISOString(),
      quantity: parseFloat(formData.quantity),
      CLR: parseFloat(formData.CLR) || -1,
      FAT: parseFloat(formData.FAT) || -1,
      SNF: parseFloat(formData.SNF) || -1,
      water: parseFloat(formData.water) || -1,
      alcohol: formData.alcohol,
      MBRT: parseFloat(formData.MBRT) || -1,
      Batch: formData.Batch,
      timestamp: new Date().toISOString(),
    };

    const updatedCollections = [...collections, newCollection];
    setCollections(updatedCollections);
    localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(updatedCollections));

    if (!batches[formData.Batch]) {
      const updatedBatches = {
        ...batches,
        [formData.Batch]: { dispatched: false },
      };
      setBatches(updatedBatches);
      localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(updatedBatches));
    }

    const updatedPending = [...pendingSync, { type: "add", data: newCollection }];
    setPendingSync(updatedPending);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(updatedPending));

    resetForm();
    setShowAddModal(false);
    alert("Collection added successfully");
  };

  const handleEditCollection = async () => {
    if (!formData.quantity || !formData.Batch) {
      alert("Please fill quantity and batch fields");
      return;
    }

    const now = new Date();
    const [hours, minutes] = formData.arrivalTime.split(':');
    const arrivalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));

    const updatedCollection = {
      ...editingCollection,
      collectorName: formData.collectorName,
      arrivalTime: arrivalDate.toISOString(),
      quantity: parseFloat(formData.quantity),
      CLR: parseFloat(formData.CLR) || -1,
      FAT: parseFloat(formData.FAT) || -1,
      SNF: parseFloat(formData.SNF) || -1,
      water: parseFloat(formData.water) || -1,
      alcohol: formData.alcohol,
      MBRT: parseFloat(formData.MBRT) || -1,
      Batch: formData.Batch,
    };

    const updatedCollections = collections.map((c) =>
      c.BUID === editingCollection.BUID ? updatedCollection : c
    );
    setCollections(updatedCollections);
    localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(updatedCollections));

    if (!batches[formData.Batch]) {
      const updatedBatches = {
        ...batches,
        [formData.Batch]: { dispatched: false },
      };
      setBatches(updatedBatches);
      localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(updatedBatches));
    }

    const updatedPending = [...pendingSync, { type: "edit", data: updatedCollection }];
    setPendingSync(updatedPending);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(updatedPending));

    resetForm();
    setShowEditModal(false);
    setEditingCollection(null);
    alert("Collection updated successfully");
  };

  const handleAddDeduction = async () => {
    if (!deductionForm.reason || !deductionForm.quantity) {
      alert("Please fill all fields");
      return;
    }

    const newDeduction = {
      id: generateBUID(),
      batch: selectedBatch,
      reason: deductionForm.reason,
      quantity: parseFloat(deductionForm.quantity),
      timestamp: new Date().toISOString(),
    };

    const updatedDeductions = [...deductions, newDeduction];
    setDeductions(updatedDeductions);
    localStorage.setItem(STORAGE_KEYS.DEDUCTIONS, JSON.stringify(updatedDeductions));

    const updatedPending = [...pendingSync, { type: "deduction", data: newDeduction }];
    setPendingSync(updatedPending);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(updatedPending));

    setDeductionForm({ reason: "", quantity: "" });
    setShowDeductionModal(false);
    setSelectedBatch(null);
    alert("Deduction added successfully");
  };

  const toggleBatchDispatch = async (batchName) => {
    const updatedBatches = {
      ...batches,
      [batchName]: { dispatched: !batches[batchName].dispatched },
    };
    setBatches(updatedBatches);
    localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(updatedBatches));

    const updatedPending = [
      ...pendingSync,
      {
        type: "batch_dispatch",
        data: {
          batch: batchName,
          dispatched: updatedBatches[batchName].dispatched,
        },
      },
    ];
    setPendingSync(updatedPending);
    localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify(updatedPending));
  };

  const syncPendingData = async () => {
    setSyncing(true);
    setLoader(true);
    
    if (pendingSync.length === 0) {
      await fetchFromSheets();
      setLoader(false);
      setSyncing(false);
      return;
    }

    try {
      const response = await fetch(SHEETS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: pendingSync }),
      });

      if (response.ok) {
        setPendingSync([]);
        localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, JSON.stringify([]));
        alert("Data synced with Google Sheets");
        await fetchFromSheets();
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("Failed to sync data. Will retry when online.");
    }

    setLoader(false);
    setSyncing(false);
  };

  const handleRefresh = async () => {
    await loadLocalData();
    if (isOnline && pendingSync.length === 0) {
      await fetchFromSheets();
    }
  };

  const getBatchTotals = () => {
    const batchData = {};
    collections.forEach((c) => {
      if (!batchData[c.Batch]) {
        batchData[c.Batch] = {
          total: 0,
          dispatched: batches[c.Batch]?.dispatched || false,
        };
      }
      batchData[c.Batch].total += c.quantity;
    });

    deductions.forEach((d) => {
      if (batchData[d.batch]) {
        batchData[d.batch].total -= d.quantity;
      }
    });

    return batchData;
  };

  const resetForm = () => {
    setFormData({
      collectorName: COLLECTORS[0],
      arrivalTime: new Date().toTimeString().slice(0, 5),
      quantity: "",
      CLR: "",
      FAT: "",
      SNF: "",
      water: "",
      alcohol: ALCOHOL_OPS[2],
      MBRT: "",
      Batch: "",
    });
  };

  const openEditModal = (collection) => {
    setEditingCollection(collection);
    setFormData({
      collectorName: collection.collectorName,
      arrivalTime: formatTime(collection.arrivalTime),
      quantity: collection.quantity.toString(),
      CLR: collection.CLR.toString(),
      FAT: collection.FAT.toString(),
      SNF: collection.SNF.toString(),
      water: collection.water.toString(),
      alcohol: collection.alcohol,
      MBRT: collection.MBRT.toString(),
      Batch: collection.Batch,
    });
    setShowEditModal(true);
  };

  const batchTotals = getBatchTotals();

  const Modal = ({ show, onClose, title, children }) => {
    if (!show) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            {children}
          </div>
        </div>
      </div>
    );
  };

  if (loader) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-lg text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-500 text-white p-4 md:p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold mb-2">Milk Collection Tracker</h1>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-sm">{isOnline ? 'Online' : 'Offline'}</span>
              {pendingSync.length > 0 && (
                <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded">
                  {pendingSync.length} pending
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => isOnline ? syncPendingData() : alert('Cannot sync while offline')}
            disabled={syncing}
            className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 px-4 py-2 rounded-full font-bold text-sm transition-colors"
          >
            {syncing ? 'SYNCING...' : 'SYNC'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b flex">
        <button
          className={`flex-1 py-4 text-center font-medium ${
            activeTab === 'batches'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-600'
          }`}
          onClick={() => setActiveTab('batches')}
        >
          Batches
        </button>
        <button
          className={`flex-1 py-4 text-center font-medium ${
            activeTab === 'collections'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-600'
          }`}
          onClick={() => setActiveTab('collections')}
        >
          Collections
        </button>
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        {activeTab === 'batches' && (
          <div className="space-y-4">
            {Object.keys(batchTotals).length === 0 ? (
              <p className="text-center text-gray-500 mt-8">No batches yet</p>
            ) : (
              Object.entries(batchTotals).reverse().map(([batch, data]) => (
                <div key={batch} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg">Batch: {batch}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${
                      data.dispatched ? 'bg-green-500' : 'bg-orange-500'
                    }`}>
                      {data.dispatched ? 'DISPATCHED' : 'PENDING'}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-blue-500 mb-4">{data.total.toFixed(2)} L</p>
                  
                  <div className="flex items-center justify-between py-3 border-t">
                    <span className="font-semibold">Mark as Dispatched:</span>
                    <label className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        disabled={data.dispatched}
                        checked={data.dispatched}
                        onChange={() => toggleBatchDispatch(batch)}
                        className="sr-only peer"
                      />
                      <div className="w-full h-full bg-gray-300 peer-checked:bg-blue-500 rounded-full peer-disabled:opacity-50 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-transform"></div>
                    </label>
                  </div>

                  {!data.dispatched && (
                    <button
                      onClick={() => {
                        setSelectedBatch(batch);
                        setShowDeductionModal(true);
                      }}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded mt-2 transition-colors"
                    >
                      Add Deduction
                    </button>
                  )}

                  {deductions.filter(d => d.batch === batch).map(d => (
                    <div key={d.id} className="bg-orange-50 border-l-4 border-orange-500 p-3 mt-2 rounded">
                      <p className="text-sm text-gray-700">-{d.quantity}L: {d.reason}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'collections' && (
          <div className="space-y-4">
            {collections.length === 0 ? (
              <p className="text-center text-gray-500 mt-8">No collections yet</p>
            ) : (
              [...collections].reverse().map((collection) => (
                <div key={collection.BUID} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-blue-500">{collection.BUID}</span>
                    <button
                      onClick={() => openEditModal(collection)}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded font-bold text-sm transition-colors flex items-center gap-1"
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                  </div>
                  <div className="space-y-1 text-sm text-gray-700">
                    <p><span className="font-semibold">Collector:</span> {collection.collectorName}</p>
                    <p>
                      <span className="font-semibold">Batch:</span> {collection.Batch}
                      <span className={`ml-2 text-xs font-bold ${
                        batches[collection.Batch]?.dispatched ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        ({batches[collection.Batch]?.dispatched ? 'DISPATCHED' : 'PENDING'})
                      </span>
                    </p>
                    <p><span className="font-semibold">Quantity:</span> {collection.quantity} L</p>
                    <p><span className="font-semibold">Arrival:</span> {formatTime(collection.arrivalTime)}</p>
                    <p><span className="font-semibold">FAT:</span> {collection.FAT} | <span className="font-semibold">SNF:</span> {collection.SNF} | <span className="font-semibold">CLR:</span> {collection.CLR}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => {
          resetForm();
          setShowAddModal(true);
        }}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-3xl transition-colors"
      >
        <Plus size={32} />
      </button>

      {/* Add/Edit Modal */}
      <Modal
        show={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingCollection(null);
          resetForm();
        }}
        title={showEditModal ? 'Edit Collection' : 'New Collection'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Collector Name</label>
            <div className="flex flex-wrap gap-2">
              {COLLECTORS.map(name => (
                <button
                  key={name}
                  onClick={() => setFormData({ ...formData, collectorName: name })}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    formData.collectorName === name
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Arrival Time</label>
            <input
              type="time"
              value={formData.arrivalTime}
              onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity (L) *</label>
            <input
              type="number"
              step="0.01"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="Enter quantity"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Batch * (E/M-ddmmyy)</label>
            <input
              type="text"
              value={formData.Batch}
              onChange={(e) => setFormData({ ...formData, Batch: e.target.value })}
              placeholder="Enter batch name"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">CLR</label>
              <input
                type="number"
                step="0.01"
                value={formData.CLR}
                onChange={(e) => setFormData({ ...formData, CLR: e.target.value })}
                placeholder="Enter CLR"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">FAT</label>
              <input
                type="number"
                step="0.01"
                value={formData.FAT}
                onChange={(e) => setFormData({ ...formData, FAT: e.target.value })}
                placeholder="Enter FAT"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">SNF</label>
              <input
                type="number"
                step="0.01"
                value={formData.SNF}
                onChange={(e) => setFormData({ ...formData, SNF: e.target.value })}
                placeholder="Enter SNF"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Water</label>
              <input
                type="number"
                step="0.01"
                value={formData.water}
                onChange={(e) => setFormData({ ...formData, water: e.target.value })}
                placeholder="Enter water"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Alcohol Test</label>
            <div className="flex flex-wrap gap-2">
              {ALCOHOL_OPS.map(option => (
                <button
                  key={option}
                  onClick={() => setFormData({ ...formData, alcohol: option })}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    formData.alcohol === option
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">MBRT Hours</label>
            <input
              type="number"
              step="0.01"
              value={formData.MBRT}
              onChange={(e) => setFormData({ ...formData, MBRT: e.target.value })}
              placeholder="Enter MBRT"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => {
                setShowAddModal(false);
                setShowEditModal(false);
                setEditingCollection(null);
                resetForm();
              }}
              className="flex-1 py-3 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={showEditModal ? handleEditCollection : handleAddCollection}
              className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold transition-colors"
            >
              {showEditModal ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Deduction Modal */}
      <Modal
        show={showDeductionModal}
        onClose={() => {
          setShowDeductionModal(false);
          setSelectedBatch(null);
          setDeductionForm({ reason: "", quantity: "" });
        }}
        title={`Add Deduction - ${selectedBatch}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Reason *</label>
            <input
              type="text"
              value={deductionForm.reason}
              onChange={(e) => setDeductionForm({ ...deductionForm, reason: e.target.value })}
              placeholder="e.g., Lab sample, Spillage"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity (L) *</label>
            <input
              type="number"
              step="0.01"
              value={deductionForm.quantity}
              onChange={(e) => setDeductionForm({ ...deductionForm, quantity: e.target.value })}
              placeholder="Enter quantity"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => {
                setShowDeductionModal(false);
                setSelectedBatch(null);
                setDeductionForm({ reason: "", quantity: "" });
              }}
              className="flex-1 py-3 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDeduction}
              className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}