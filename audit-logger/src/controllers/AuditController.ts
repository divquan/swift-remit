import express from 'express';
import { AuditLogService } from '@/services/AuditLogService';
import { AuditLogData, AuditLogBatch, AuditLogFilter } from '@/types';

const router = express.Router();
const auditLogService = new AuditLogService();

/**
 * POST /api/audit/log - Log a single audit event
 */
router.post('/log', async (req, res) => {
  try {
    const auditData: AuditLogData = {
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    };

    // Use queue for better performance
    auditLogService.queueEvent(auditData);

    res.status(200).json({
      success: true,
      message: 'Audit log queued successfully',
    });
  } catch (error) {
    console.error('Error logging audit event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log audit event',
    });
  }
});

/**
 * POST /api/audit/batch - Log multiple audit events in batch
 */
router.post('/batch', async (req, res) => {
  try {
    const { logs }: AuditLogBatch = req.body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid batch data - logs array is required',
      });
    }

    // Add IP and User-Agent to each log
    const enrichedLogs = logs.map(log => ({
      ...log,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    }));

    await auditLogService.logBatch(enrichedLogs);

    res.status(200).json({
      success: true,
      message: `Batch of ${logs.length} audit logs processed successfully`,
    });
  } catch (error) {
    console.error('Error processing audit batch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process audit batch',
    });
  }
});

/**
 * GET /api/audit/search - Search and filter audit logs
 */
router.get('/search', async (req, res) => {
  try {
    const filter: AuditLogFilter = {
      userId: req.query.userId as string,
      remittanceId: req.query.remittanceId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      service: req.query.service as string,
      level: req.query.level as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await auditLogService.searchLogs(filter);

    res.status(200).json({
      success: true,
      data: result.logs,
      total: result.total,
      pagination: {
        limit: filter.limit,
        offset: filter.offset,
        hasMore: (filter.offset || 0) + (filter.limit || 100) < result.total,
      },
    });
  } catch (error) {
    console.error('Error searching audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search audit logs',
    });
  }
});

/**
 * GET /api/audit/remittance/:id - Get audit logs for a specific remittance
 */
router.get('/remittance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await auditLogService.getRemittanceLogs(id);

    res.status(200).json({
      success: true,
      data: logs,
      total: logs.length,
    });
  } catch (error) {
    console.error('Error getting remittance audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get remittance audit logs',
    });
  }
});

/**
 * GET /api/audit/user/:id - Get audit logs for a specific user
 */
router.get('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await auditLogService.getUserLogs(id, limit, offset);

    res.status(200).json({
      success: true,
      data: result.logs,
      total: result.total,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
    });
  } catch (error) {
    console.error('Error getting user audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user audit logs',
    });
  }
});

/**
 * GET /api/audit/stats - Get audit log statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const stats = await auditLogService.getStats(startDate, endDate);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting audit stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audit statistics',
    });
  }
});

/**
 * POST /api/audit/cleanup - Clean up old audit logs (admin only)
 */
router.post('/cleanup', async (req, res) => {
  try {
    const deletedCount = await auditLogService.cleanupOldLogs();

    res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedCount} old audit logs`,
      deletedCount,
    });
  } catch (error) {
    console.error('Error cleaning up audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup audit logs',
    });
  }
});

export default router;
