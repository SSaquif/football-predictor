import React, { createContext, useEffect, useState, useContext } from "react";
import {
  User as FirebaseUser,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  getDoc,
} from "firebase/firestore";
import toast from "react-hot-toast";
import firebaseApp from "../firebase/firebase-config";
import converter from "../firebase/utils/converter";
import UserSummary from "../models/UserSummary";
import ErrorLogs, { ErrorEvent } from "../models/ErrorLogs";

interface AuthContextData {
  userAuth: FirebaseUser | null;
  setUserAuth: React.Dispatch<React.SetStateAction<FirebaseUser | null>>;
  userSummary: UserSummary | null;
  setUserSummary: React.Dispatch<React.SetStateAction<UserSummary | null>>;
  authLoading: boolean;
  setAuthLoading: React.Dispatch<React.SetStateAction<boolean>>;
  userViewMode: boolean;
  changeUserViewMode: (isUserViewMode: boolean) => void;
}

export const AuthContext = createContext({ userAuth: null } as AuthContextData);

export default function AuthProvider({ children }: React.PropsWithChildren) {
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [userAuth, setUserAuth] = useState<FirebaseUser | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [userViewMode, setUserViewMode] = useState<boolean>(false);

  function changeUserViewMode(isUserViewMode: boolean): void {
    if (userSummary?.isAdmin) setUserViewMode(isUserViewMode);
    return;
  }

  // Get Existing User or Create New User
  const getOrCreateUser = async () => {
    const db = getFirestore(firebaseApp);
    try {
      const usersRef = collection(db, "userSummary").withConverter(
        converter<UserSummary>()
      );
      const q = query(usersRef, where("uid", "==", userAuth?.uid));
      const querySnap = await getDocs(q);

      if (querySnap.docs.length && querySnap.docs.length !== 1) {
        // Multiple UserSummary for same Google acount
        // FYI: this should technically never happen
        throw new Error("Multiple UserAppData Docs for Same Google Account");
      } else if (querySnap.empty && userAuth) {
        // Create new user
        const { email, phoneNumber, photoURL, uid } = userAuth;
        const docRef = await addDoc(usersRef, {
          email,
          phoneNumber,
          photoURL,
          uid,
          isAdmin: false,
        });
        // Get the newly created doc And update state
        const querySnap = await getDoc(docRef);
        if (querySnap.exists()) {
          setUserSummary(querySnap.data());
        }
      } else {
        // Otherwise Just update state
        setUserSummary(querySnap.docs[0].data());
      }
    } catch (err: any) {
      const errorLogsRef = collection(db, "errorLogs").withConverter(
        converter<ErrorLogs>()
      );
      let event: ErrorEvent = "User Creation Error";

      await addDoc(errorLogsRef, {
        errorMsg: err.message,
        timestamp: new Date(),
        event: event,
        userUid: userAuth?.uid,
        userEmail: userAuth?.email,
      });
      // This is ok cause we skip this function call when user is null
      // FYI: So should not cause infinite re-renders
      setUserAuth(null);
      toast.error("Error creating/retrieving user", { duration: 5000 });
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (userAuth) {
      setAuthLoading(true);
      getOrCreateUser();
    }
  }, [userAuth]);

  return (
    <AuthContext.Provider
      value={{
        userAuth,
        setUserAuth,
        userSummary,
        setUserSummary,
        authLoading,
        setAuthLoading,
        userViewMode,
        changeUserViewMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/*
 * Following components require AuthContext
 */

export function SignInButton() {
  const { setUserAuth } = useContext(AuthContext);
  const signInWithGoogle = () => {
    signInWithPopup(getAuth(firebaseApp), new GoogleAuthProvider())
      .then((result) => {
        const { user } = result;
        setUserAuth(user);
      })
      .catch((err) => {
        const db = getFirestore(firebaseApp);
        const errorLogsRef = collection(db, "errorLogs").withConverter(
          converter<ErrorLogs>()
        );
        addDoc(errorLogsRef, {
          errorMsg: err.message,
          code: err.code,
          timestamp: new Date(),
          event: "Google Sign In Failure",
        });
        toast.error("Google Sign In Failure, please try again in a Moment", {
          duration: 5000,
        });
      });
  };

  return <button onClick={signInWithGoogle}>Sign In with Google</button>;
}

// TODO: remember to clear up any new states on log out
export function SignOutButton() {
  const { setUserAuth, setUserSummary } = useContext(AuthContext);

  const handleSignOut = () => {
    signOut(getAuth(firebaseApp))
      .then(() => {
        setUserAuth(null);
        setUserSummary(null);
      })
      .catch((err) => {
        const db = getFirestore(firebaseApp);
        const errorLogsRef = collection(db, "errorLogs").withConverter(
          converter<ErrorLogs>()
        );
        addDoc(errorLogsRef, {
          errorMsg: err.message,
          code: err.code,
          timestamp: new Date(),
          event: "Google Sign Out Failure",
        });
        toast.error("Google Sign Out Failure, please try again in a Moment", {
          duration: 5000,
        });
      });
  };

  return <button onClick={handleSignOut}>Sign Out</button>;
}
