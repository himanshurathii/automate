const ExcelJS = require('exceljs');

/**
 * Generates a styled Excel sheet of leads.
 * @param {Array<Object>} leads - Array of lead objects
 * @returns {Promise<Buffer>} - Returns Excel file buffer
 */
async function generateLeadsExcel(leads) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IndiaMART Lead Automation';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Leads List');

  // Define columns and widths
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'IndiaMART Lead ID', key: 'indiamartLeadId', width: 22 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Buyer Name', key: 'buyerName', width: 25 },
    { header: 'Company Name', key: 'companyName', width: 25 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'State', key: 'state', width: 15 },
    { header: 'Product', key: 'product', width: 25 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Message', key: 'message', width: 40 },
    { header: 'Claimed By', key: 'claimedBy', width: 15 },
    { header: 'Created At', key: 'createdAt', width: 22 }
  ];

  // Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' } // White
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F497D' } // Navy Blue
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF122B4A' } },
      bottom: { style: 'medium', color: { argb: 'FF122B4A' } },
      left: { style: 'thin', color: { argb: 'FF122B4A' } },
      right: { style: 'thin', color: { argb: 'FF122B4A' } }
    };
  });

  // Populate data
  leads.forEach((lead) => {
    const row = worksheet.addRow({
      id: lead.id,
      indiamartLeadId: lead.indiamartLeadId,
      priority: lead.priority ? lead.priority.toUpperCase() : 'MEDIUM',
      status: lead.status ? lead.status.toLowerCase() : 'new',
      buyerName: lead.buyerName || '',
      companyName: lead.companyName || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      state: lead.state || '',
      product: lead.product || '',
      quantity: lead.quantity || '',
      message: lead.message || '',
      claimedBy: lead.claimedBy || '',
      createdAt: lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ''
    });

    row.height = 22;
  });

  // Apply row styling (zebra striping, alignments, colors for priority)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip headers

    const isEven = rowNumber % 2 === 0;
    const priorityCell = row.getCell('priority');
    const statusCell = row.getCell('status');

    row.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      
      // Default cell border
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
      };

      // Zebra striping
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' } // Light grey/white
        };
      }
    });

    // Custom priority coloring
    const priorityVal = priorityCell.value?.toString().toLowerCase();
    if (priorityVal === 'high') {
      priorityCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF9C0006' } }; // Dark red
      priorityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC7CE' } // Soft red
      };
    } else if (priorityVal === 'low') {
      priorityCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF5C5C5C' } };
    } else {
      priorityCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF9C6500' } }; // Dark yellow
      priorityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB9C' } // Soft yellow
      };
    }
    priorityCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Status styling
    const statusVal = statusCell.value?.toString().toLowerCase();
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (statusVal === 'new') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2F0D9' } // Light green
      };
      statusCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF385723' } };
    }
  });

  // Freeze top row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Write to Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = {
  generateLeadsExcel
};
