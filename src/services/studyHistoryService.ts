import { collection, addDoc, query, where, orderBy, getDocs, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/config/firebase";
import { AnalysisResult, QuestionResult } from "@/components/StudyAssistant";

export interface StudyHistoryRecord {
  id?: string;
  userId: string;
  timestamp: Timestamp;
  type: "analysis" | "quiz";
  fileName?: string;
  difficulty: string;
  language: string;
  score?: number;
  totalQuestions?: number;
  percentage?: number;
  data: any;
  fileUrls?: string[];
  pageAnalysesMap?: Record<string, any>; // Store page analyses for PDF files
  analysisData?: {
    keyPoints: string[];
    studyPoints: any[];
    summary: string;
    tnpscRelevance: string;
    tnpscCategories: string[];
    mainTopic: string;
  };
  quizData?: {
    questions: any[];
    answers: any[];
    score: number;
    totalQuestions: number;
    percentage: number;
    difficulty: string;
  };
}

export const saveStudyHistory = async (
  userId: string,
  type: "analysis" | "quiz",
  data: AnalysisResult[] | QuestionResult | any,
  options: {
    fileName?: string;
    difficulty: string;
    language: string;
    score?: number;
    totalQuestions?: number;
    percentage?: number;
    files?: File[];
    quizAnswers?: any[];
    pageAnalysesMap?: Record<string, any>;
  }
): Promise<string> => {
  try {
    let fileUrls: string[] = [];
    
    // Upload files to Firebase Storage if provided
    if (options.files && options.files.length > 0) {
      for (const file of options.files) {
        const timestamp = Date.now();
        const fileName = `${userId}/${timestamp}_${file.name}`;
        const storageRef = ref(storage, `study-files/${fileName}`);
        
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        fileUrls.push(downloadURL);
      }
    }

    let analysisData = null;
    let quizData = null;

    if (type === "analysis" && Array.isArray(data)) {
      // Store analysis data in a structured format
      const analysis = data[0]; // Take first analysis result
      analysisData = {
        keyPoints: analysis.keyPoints || [],
        studyPoints: analysis.studyPoints || [],
        summary: analysis.summary || '',
        tnpscRelevance: analysis.tnpscRelevance || '',
        tnpscCategories: analysis.tnpscCategories || [],
        mainTopic: analysis.mainTopic || options.fileName || 'Study Material'
      };
    } else if (type === "quiz") {
      // Store quiz data with answers
      quizData = {
        questions: data.questions || [],
        answers: options.quizAnswers || [],
        score: options.score || 0,
        totalQuestions: options.totalQuestions || 0,
        percentage: options.percentage || 0,
        difficulty: options.difficulty
      };
    }

    const record: Omit<StudyHistoryRecord, 'id'> = {
      userId,
      timestamp: Timestamp.now(),
      type,
      fileName: options.fileName,
      difficulty: options.difficulty,
      language: options.language,
      data,
      fileUrls,
      analysisData,
      quizData
    };

    // Only include pageAnalysesMap if it's defined
    if (options.pageAnalysesMap !== undefined) {
      record.pageAnalysesMap = options.pageAnalysesMap;
    }

    // Only include score, totalQuestions, and percentage if they are defined
    if (options.score !== undefined) {
      record.score = options.score;
    }
    if (options.totalQuestions !== undefined) {
      record.totalQuestions = options.totalQuestions;
    }
    if (options.percentage !== undefined) {
      record.percentage = options.percentage;
    }

    const docRef = await addDoc(collection(db, "studyHistory"), record);
    console.log("Study history saved successfully:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error saving study history:", error);
    throw error;
  }
};

export const updateStudyHistory = async (
  recordId: string,
  analysisData: {
    keyPoints: string[];
    studyPoints: any[];
    summary: string;
    tnpscRelevance: string;
    tnpscCategories: string[];
    mainTopic: string;
  },
  pageAnalysesMap?: Record<string, any>
): Promise<void> => {
  try {
    const docRef = doc(db, "studyHistory", recordId);
    const updateData: any = {
      analysisData,
      data: [analysisData],
      timestamp: Timestamp.now() // Update timestamp to reflect latest changes
    };
    
    if (pageAnalysesMap) {
      updateData.pageAnalysesMap = pageAnalysesMap;
    }
    
    await updateDoc(docRef, updateData);
    console.log("Study history updated successfully:", recordId);
  } catch (error) {
    console.error("Error updating study history:", error);
    throw error;
  }
};

export const getStudyHistory = async (userId: string): Promise<StudyHistoryRecord[]> => {
  try {
    const q = query(
      collection(db, "studyHistory"),
      where("userId", "==", userId),
      orderBy("timestamp", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const history: StudyHistoryRecord[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      history.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp // Keep as Firestore Timestamp for now
      } as StudyHistoryRecord);
    });
    
    return history;
  } catch (error) {
    console.error("Error fetching study history:", error);
    throw error;
  }
};

export const getStudyHistoryForFile = async (userId: string, fileName: string): Promise<StudyHistoryRecord | null> => {
  try {
    const q = query(
      collection(db, "studyHistory"),
      where("userId", "==", userId),
      where("fileName", "==", fileName),
      where("type", "==", "analysis"),
      orderBy("timestamp", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    return {
      id: doc.id,
      ...data,
      timestamp: data.timestamp
    } as StudyHistoryRecord;
  } catch (error) {
    console.error("Error fetching study history for file:", error);
    return null;
  }
};

export const deleteStudyHistory = async (recordId: string, fileUrls?: string[]): Promise<void> => {
  try {
    // Delete the document from Firestore
    await deleteDoc(doc(db, "studyHistory", recordId));
    
    // Delete associated files from Storage
    if (fileUrls && fileUrls.length > 0) {
      for (const url of fileUrls) {
        try {
          const fileRef = ref(storage, url);
          await deleteObject(fileRef);
        } catch (error) {
          console.warn("Error deleting file from storage:", error);
        }
      }
    }
  } catch (error) {
    console.error("Error deleting study history:", error);
    throw error;
  }
};