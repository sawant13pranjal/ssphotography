"use server";

import prisma from './prisma';
import { User, Booking, ClientQuery, TeamApplication, ClientQueryMessage, Event, Photo } from '@prisma/client';
import { isTempEmail } from './utils';

// We no longer need this local function for Supabase
export const initDb = async () => {
  return;
};

import { unstable_noStore as noStore } from 'next/cache';

// --- Users ---
export const getUsers = async (): Promise<User[]> => {
  noStore();
  try {
    console.log("[DB_DEBUG] Attempting to connect to Prisma and fetch all users...");
    const users = await prisma.user.findMany();
    console.log(`[DB_DEBUG] Successfully fetched ${users.length} users.`);
    return users;
  } catch (error: any) {
    console.error("[DB_DEBUG] DATABASE FATAL ERROR:", error);
    console.error("[DB_DEBUG] Current DB URL configured:", process.env.DATABASE_URL?.substring(0, 50) + "...");
    
    // Check if it's a Prisma Initialization Error
    if (error.message.includes('PrismaClientInitializationError')) {
      console.error("[DB_DEBUG] Prisma Client Initialization failed - Check DATABASE_URL and server access.");
    }
    
    throw new Error(`Database error: Please check server logs for details.`);
  }
};

export const addUser = async (userData: any): Promise<User> => {
  try {
    const newUser = await prisma.user.create({
      data: {
        email: userData.email,
        password: userData.password,
        name: userData.name,
        phone: userData.phone,
        image: userData.image,
        role: userData.role || 'client'
      }
    });
    return newUser;
  } catch (error: any) {
    console.error("Prisma Error Details:", error);
    if (error.code === 'P2002') {
      throw new Error(`The email address "${userData.email}" is already associated with an account.`);
    }
    if (error.code === 'P2003') {
      throw new Error("One or more required fields are missing or invalid.");
    }
    throw new Error(error.message || "Something went wrong during account creation. Please try again.");
  }
};

export const updateUserAvatar = async (id: number, imageUrl: string): Promise<User> => {
  return await prisma.user.update({
    where: { id },
    data: { image: imageUrl }
  });
};

export const updateUserProfile = async (id: number, data: { name?: string, phone?: string, email?: string }): Promise<User> => {
  return await prisma.user.update({
    where: { id },
    data
  });
};

export const updateUserPassword = async (id: string, oldPassword: string, newPassword: string): Promise<User> => {
  const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.password !== oldPassword) {
    throw new Error("The current password you entered is incorrect.");
  }

  return await prisma.user.update({
    where: { id: parseInt(id) },
    data: { password: newPassword }
  });
};

// --- Bookings ---
export const getBookings = async (): Promise<any[]> => {
  return await prisma.booking.findMany({
    include: { installments: true },
    orderBy: { createdAt: 'desc' }
  });
};

export const getBookingWithInstallments = async (id: string): Promise<any> => {
  return await prisma.booking.findUnique({
    where: { id },
    include: { installments: { orderBy: { date: 'asc' } } }
  });
};

export const addBooking = async (bookingData: any): Promise<Booking> => {
  return await prisma.booking.create({
    data: {
      clientName: bookingData.clientName,
      email: bookingData.email,
      phone: bookingData.phone,
      eventType: bookingData.eventType,
      eventDate: bookingData.eventDate,
      location: bookingData.location,
      hours: bookingData.hours || 4,
      amount: bookingData.amount,
      packageType: bookingData.packageType,
      packageFeatures: bookingData.packageFeatures || [],
      photographerName: bookingData.photographerName || null,
      message: bookingData.message,
      photographerNotes: bookingData.photographerNotes || null,
      status: bookingData.status || "Pending",
      advancePaid: bookingData.advancePaid || 0,
      totalPaid: bookingData.advancePaid || 0,
      paymentMethod: bookingData.paymentMethod || "Cash",
      isCustomPrice: bookingData.isCustomPrice || false,
      isOffline: bookingData.isOffline || false,
      travelCharges: bookingData.travelCharges || 0
    }
  });
};

export const addPaymentInstallment = async (bookingId: string, amount: number, method: string = "Cash"): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    // 1. Create installment
    await tx.paymentInstallment.create({
      data: { bookingId, amount, method }
    });

    // 2. Update booking total paid
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        totalPaid: { increment: amount }
      }
    });
  });
};

export const updateBookingStatus = async (id: string, newStatus: string, reason?: string): Promise<void> => {
  await prisma.booking.update({
    where: { id },
    data: {
      status: newStatus,
      cancellationReason: reason || null
    }
  });
};

export const updateBookingPayment = async (bookingId: string, orderId: string, paymentId: string, signature: string): Promise<void> => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId }
  });

  if (!booking) return;

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: booking.status === "Confirmed" ? "Confirmed" : "Pending", 
      isOffline: false, // Ensure it's marked as online once a razorpay payment lands
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      totalPaid: booking.amount // Mark as fully paid
    }
  });
};

export const updateBookingPhotographer = async (id: string, name: string): Promise<void> => {
  await prisma.booking.update({
    where: { id },
    data: { photographerName: name }
  });
};

// --- Queries (Multi-message Conversational) ---
export const getQueries = async (): Promise<(ClientQuery & { messages: ClientQueryMessage[] })[]> => {
  return await prisma.clientQuery.findMany({
    include: { messages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' }
  });
};

export const addQueryMessage = async (queryId: string, text: string, sender: 'admin' | 'client'): Promise<void> => {
  await prisma.clientQueryMessage.create({
    data: {
      queryId,
      text,
      sender,
      status: 'sent'
    }
  });

  // Update query status if admin replies
  if (sender === 'admin') {
    await updateQueryStatus(queryId, "Answered");
  } else {
    await updateQueryStatus(queryId, "Open");
  }
};

export const addQuery = async (queryData: any): Promise<void> => {
  await prisma.clientQuery.create({
    data: {
      name: queryData.name,
      email: queryData.email,
      userEmail: queryData.userEmail || null,
      date: new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
      message: queryData.message,
      status: "Open"
    }
  });
};

export const updateQueryStatus = async (id: string, newStatus: string): Promise<void> => {
  await prisma.clientQuery.update({
    where: { id },
    data: { status: newStatus }
  });
};

// --- Team Applications ---
export const addTeamApplication = async (data: any): Promise<void> => {
  // Email validation
  if (isTempEmail(data.email)) {
    throw new Error("Temporary email addresses are not allowed.");
  }

  await prisma.teamApplication.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      experience: parseInt(data.experience) || 0,
      specialization: data.specialization,
      portfolioUrl: data.portfolioUrl,
      status: "Pending"
    }
  });
};

export const getTeamApplications = async (): Promise<TeamApplication[]> => {
  return await prisma.teamApplication.findMany({
    orderBy: { createdAt: 'desc' }
  });
};

export const updateTeamApplicationStatus = async (id: number, status: string): Promise<void> => {
  await prisma.teamApplication.update({
    where: { id },
    data: { status }
  });
};

export const getEvents = async (onlyPublished = false): Promise<any[]> => {
  try {
    const where = onlyPublished ? { isPublished: true } : {};
    return await prisma.event.findMany({
      where,
      include: {
        _count: {
          select: { photos: true }
        }
      },
      orderBy: { date: 'desc' }
    });
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to fetch events:", error);
    throw new Error(`Prisma Error: ${error.message}`);
  }
};

export const addEvent = async (eventData: any): Promise<Event> => {
  try {
    console.log("[DB_DEBUG] Creating new event:", eventData.name);
    return await prisma.event.create({
      data: {
        name: eventData.name,
        date: eventData.date, // Expects YYYY-MM-DD
        type: eventData.type,
        photoCount: eventData.photoCount || 0,
        qrCode: eventData.qrCode || `SS-${Date.now()}`,
        albumId: eventData.albumId || `E-${Date.now()}`,
        driveLink: eventData.driveLink || null,
        zipPath: eventData.zipPath || null,
        isPublished: false,
        aiStatus: 'Pending'
      }
    });
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to create event:", error);
    throw new Error(`Prisma Error: ${error.message}`);
  }
};

export const updateEventAiStatus = async (albumId: string, isProcessed: boolean, providedAlbumId?: string, status: string = 'Ready'): Promise<void> => {
  try {
    // Try to update by internal ID (CUID) first
    try {
      await prisma.event.update({
        where: { id: albumId }, 
        data: { 
          isFaceProcessed: isProcessed,
          aiStatus: status
        }
      });
    } catch (e) {
      // If that fails, it's a human-readable albumId from the AI Engine
      await prisma.event.update({
        where: { albumId: albumId },
        data: { 
          isFaceProcessed: isProcessed,
          aiStatus: status
        }
      });
    }
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to update event status for albumId:", albumId, error);
    throw error;
  }
};

export const updateEventProgress = async (albumId: string, current: number, total: number, lastPhoto?: string, stage?: string): Promise<void> => {
  try {
    await prisma.event.update({
      where: { albumId: albumId }, // Use human-readable albumId from terminal
      data: {
        currentProgress: current,
        totalPhotos: total,
        photoCount: total,
        lastPhoto: lastPhoto || null,
        aiStage: stage || 'Scanning...',
        aiStatus: 'Processing'
      }
    });
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to update progress for albumId:", albumId, error);
  }
};

export const deleteEvent = async (id: string): Promise<void> => {
  try {
    await prisma.event.delete({
      where: { id }
    });
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to delete event:", error);
    throw error;
  }
};

export const toggleEventPublish = async (id: string, publish: boolean): Promise<void> => {
  try {
    // Try to update by primary key (id) first
    try {
      await prisma.event.update({
        where: { id },
        data: { isPublished: publish }
      });
    } catch (e) {
      // If primary key fails, try by albumId (for the AI Engine webhook)
      await prisma.event.update({
        where: { albumId: id },
        data: { isPublished: publish }
      });
    }
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to toggle publication for ID/albumId:", id, error);
    throw error;
  }
};

// --- Helpers ---
export const markQueryMessagesAsSeen = async (queryId: string, readerRole: 'admin' | 'client'): Promise<void> => {
  try {
    // If admin reads, mark client messages as seen. If client reads, mark admin messages as seen.
    const senderToMark = readerRole === 'admin' ? 'client' : 'admin';

    await prisma.clientQueryMessage.updateMany({
      where: {
        queryId,
        sender: senderToMark,
        status: 'sent'
      },
      data: {
        status: 'seen'
      }
    });
  } catch (error: any) {
    console.error("[DB_ERROR] Failed to mark messages as seen:", error);
    throw error;
  }
};

export async function resetEventAiProgress(id: string) {
  try {
    return await prisma.event.update({
      where: { id },
      data: {
        aiStatus: 'Processing',
        currentProgress: 0,
        lastPhoto: null,
        aiStage: 'Restarting Scan...'
      }
    });
  } catch (error) {
    console.error('Error resetting AI progress:', error);
    throw error;
  }
}
