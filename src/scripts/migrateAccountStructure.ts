import { collection, getDocs, doc, setDoc, writeBatch } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export interface AccountMigrationProgress {
  totalUsers: number;
  processedUsers: number;
  totalTransactions: number;
  migratedTransactions: number;
  accountsCreated: number;
  errors: string[];
}

export async function runAccountMigration(
  onProgress?: (progress: AccountMigrationProgress) => void
): Promise<AccountMigrationProgress> {
  const usersSnap = await getDocs(collection(firestore, "users"));
  const progress: AccountMigrationProgress = {
    totalUsers: usersSnap.size,
    processedUsers: 0,
    totalTransactions: 0,
    migratedTransactions: 0,
    accountsCreated: 0,
    errors: [],
  };

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    try {
      // 1. Check if default account already exists
      const accountsSnap = await getDocs(collection(firestore, "users", userId, "accounts"));
      const existingAccounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const hasDefaultAccount = existingAccounts.some(
        (a: any) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted
      );

      // 2. Fetch all transactions
      const txSnap = await getDocs(collection(firestore, "users", userId, "transactions"));
      progress.totalTransactions += txSnap.size;

      // 3. Calculate net balance from transactions
      let netBalance = 0;
      txSnap.docs.forEach((d) => {
        const data = d.data();
        const amount = (data.amount as number) ?? 0;
        if (data.type === "income") {
          netBalance += amount;
        } else if (data.type === "expense") {
          netBalance -= amount;
        }
      });

      // 4. Create default account if not exists
      let defaultAccountId: string;
      if (!hasDefaultAccount) {
        const accountRef = doc(collection(firestore, "users", userId, "accounts"));
        defaultAccountId = accountRef.id;
        await setDoc(accountRef, {
          name: "กระเป๋าเงินสดหลัก",
          type: "cash",
          balance: Math.round(netBalance * 100) / 100,
          currency: "THB",
          is_active: true,
          is_deleted: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        progress.accountsCreated++;
      } else {
        defaultAccountId = existingAccounts.find(
          (a: any) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted
        )!.id;
      }

      // 5. Batch update transactions missing account IDs
      const docsToUpdate = txSnap.docs.filter((d) => {
        const data = d.data();
        if (data.type === "expense" && !data.from_account_id) return true;
        if (data.type === "income" && !data.to_account_id) return true;
        return false;
      });

      // Firestore batch limit = 500
      const BATCH_SIZE = 499;
      for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
        const batch = writeBatch(firestore);
        const chunk = docsToUpdate.slice(i, i + BATCH_SIZE);
        for (const txDoc of chunk) {
          const data = txDoc.data();
          const update: Record<string, any> = {};
          if (data.type === "expense" && !data.from_account_id) {
            update.from_account_id = defaultAccountId;
          }
          if (data.type === "income" && !data.to_account_id) {
            update.to_account_id = defaultAccountId;
          }
          if (Object.keys(update).length > 0) {
            batch.update(txDoc.ref, update);
            progress.migratedTransactions++;
          }
        }
        await batch.commit();
      }
    } catch (err: any) {
      progress.errors.push(`User ${userId}: ${err.message}`);
    }

    progress.processedUsers++;
    onProgress?.({ ...progress });
  }

  return progress;
}
