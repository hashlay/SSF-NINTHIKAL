import { dbClient } from './db';
import { 
  Participant, Result, Team, Unit, Competition, StageType, 
  ResultStatus, ParticipationType 
} from '../src/types';

/**
 * Service to centralize all scoreboard and standings calculations.
 */
export const CalculationService = {
  
  /**
   * Automatically calculates ranks for a specific competition,
   * respecting manual overrides and excluding inactive/absent participants.
   */
  calculateCompetitionRanks: (competitionId: string): Result[] => {
    const db = dbClient.get();
    
    // Get all results for this competition that are not soft-deleted
    const results = db.results.filter(r => r.competitionId === competitionId && !r.deletedAt);
    
    // Filter results that should be ranked
    const rankableResults = results.filter(r => 
      r.status === ResultStatus.PARTICIPATED && 
      r.totalMark !== undefined && 
      !isNaN(r.totalMark)
    );
    
    // Sort rankable results: highest mark first
    rankableResults.sort((a, b) => b.totalMark - a.totalMark);
    
    // Assign automatic ranks
    let currentRank = 1;
    for (let i = 0; i < rankableResults.length; i++) {
      if (i > 0 && rankableResults[i].totalMark < rankableResults[i - 1].totalMark) {
        currentRank = i + 1;
      }
      
      // Only apply auto-rank if there's no manual override
      if (!rankableResults[i].manualRankOverride) {
        rankableResults[i].rank = currentRank;
      }
    }
    
    // Handle manual overrides - merge overrides into the rankings
    // Non-rankable results don't get ranks
    results.forEach(r => {
      if (r.status !== ResultStatus.PARTICIPATED) {
        r.rank = undefined;
      } else if (r.manualRankOverride && r.rank === undefined) {
        // If manual rank override is true, ensure they have a rank (default to 1 if not set)
        r.rank = r.rank || 1;
      }
    });
    
    return results;
  },

  /**
   * Calculates the individual scoreboard.
   * Returns details of ALL active participants (not deleted), sorted by score.
   */
  getIndividualScoreboard: (filters: {
    categoryId?: string;
    unitId?: string;
    stageType?: StageType;
    search?: string;
  } = {}) => {
    const db = dbClient.get();
    
    // Get all active, non-deleted participants
    let participants = db.participants.filter(p => !p.deletedAt);
    
    // Apply filters
    if (filters.categoryId) {
      participants = participants.filter(p => p.selectedCategoryId === filters.categoryId);
    }
    if (filters.unitId) {
      participants = participants.filter(p => p.unitId === filters.unitId);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      participants = participants.filter(p => p.fullName.toLowerCase().includes(searchLower));
    }
    
    // Map participants to their scores
    const scoreboardEntries = participants.map(participant => {
      // Find all results for this participant
      // Individual results:
      const individualResults = db.results.filter(r => 
        r.participantId === participant.id && 
        r.status === ResultStatus.PARTICIPATED && 
        r.publishedStatus &&
        !r.deletedAt
      );
      
      // Group results: find teams where this participant is a member
      const teams = db.teams.filter(t => t.memberIds.includes(participant.id) && !t.deletedAt);
      const teamIds = teams.map(t => t.id);
      
      const groupResults = db.results.filter(r => 
        r.teamId && 
        teamIds.includes(r.teamId) && 
        r.status === ResultStatus.PARTICIPATED && 
        r.publishedStatus &&
        !r.deletedAt
      );
      
      // Fetch competition metadata for filtering by On-Stage / Off-Stage
      let filteredIndividualResults = individualResults;
      let filteredGroupResults = groupResults;
      
      if (filters.stageType) {
        filteredIndividualResults = individualResults.filter(r => {
          const comp = db.competitions.find(c => c.id === r.competitionId);
          return comp && comp.stageType === filters.stageType;
        });
        filteredGroupResults = groupResults.filter(r => {
          const comp = db.competitions.find(c => c.id === r.competitionId);
          return comp && comp.stageType === filters.stageType;
        });
      }
      
      // Calculate sums
      const individualMarks = filteredIndividualResults.reduce((sum, r) => sum + r.totalMark, 0);
      const groupMarks = filteredGroupResults.reduce((sum, r) => sum + r.totalMark, 0);
      const overallMarks = individualMarks + groupMarks;
      const totalEvents = filteredIndividualResults.length + filteredGroupResults.length;
      
      const unit = db.units.find(u => u.id === participant.unitId);
      const category = db.categories.find(c => c.id === participant.selectedCategoryId);
      
      // Find rankings in individual events
      const rankPlacements = [
        ...filteredIndividualResults.map(r => ({ compId: r.competitionId, rank: r.rank, type: 'Individual' })),
        ...filteredGroupResults.map(r => ({ compId: r.competitionId, rank: r.rank, type: 'Group' }))
      ];
      
      return {
        participantId: participant.id,
        name: participant.fullName,
        unitId: participant.unitId,
        unitName: unit ? unit.name : 'Unknown',
        categoryId: participant.selectedCategoryId,
        categoryName: category ? category.name : 'Unknown',
        totalEvents,
        individualMarks,
        groupMarks,
        overallMarks,
        placements: rankPlacements
      };
    });
    
    // Sort by overall marks descending, then by name
    scoreboardEntries.sort((a, b) => {
      if (b.overallMarks !== a.overallMarks) {
        return b.overallMarks - a.overallMarks;
      }
      return a.name.localeCompare(b.name);
    });
    
    // Assign ranks
    let currentRank = 1;
    const finalScoreboard = scoreboardEntries.map((entry, index) => {
      if (index > 0 && scoreboardEntries[index].overallMarks < scoreboardEntries[index - 1].overallMarks) {
        currentRank = index + 1;
      }
      return {
        ...entry,
        rank: currentRank
      };
    });
    
    return finalScoreboard;
  },

  /**
   * Calculates unit standings.
   * Returns standings of ALL 6 units, sorted by total accumulated score.
   */
  getUnitStandings: (filters: {
    categoryId?: string;
  } = {}) => {
    const db = dbClient.get();
    
    // Sum scores for all 6 units
    const unitStandings = db.units.map(unit => {
      // Find active participants in this unit
      let participants = db.participants.filter(p => p.unitId === unit.id && !p.deletedAt);
      if (filters.categoryId) {
        participants = participants.filter(p => p.selectedCategoryId === filters.categoryId);
      }
      
      const participantIds = participants.map(p => p.id);
      
      // Individual results for this unit's participants
      const individualResults = db.results.filter(r => 
        r.participantId && 
        participantIds.includes(r.participantId) && 
        r.status === ResultStatus.PARTICIPATED && 
        r.publishedStatus &&
        !r.deletedAt
      );
      
      // Group results for this unit's teams
      // Team result is added ONLY once towards the unit total, not multiplied!
      let teams = db.teams.filter(t => t.unitId === unit.id && !t.deletedAt);
      if (filters.categoryId) {
        teams = teams.filter(t => t.categoryId === filters.categoryId);
      }
      const teamIds = teams.map(t => t.id);
      
      const groupResults = db.results.filter(r => 
        r.teamId && 
        teamIds.includes(r.teamId) && 
        r.status === ResultStatus.PARTICIPATED && 
        r.publishedStatus &&
        !r.deletedAt
      );
      
      // On-stage subtotals
      const onStageIndividual = individualResults.filter(r => {
        const comp = db.competitions.find(c => c.id === r.competitionId);
        return comp && comp.stageType === StageType.ON_STAGE;
      });
      const onStageGroup = groupResults.filter(r => {
        const comp = db.competitions.find(c => c.id === r.competitionId);
        return comp && comp.stageType === StageType.ON_STAGE;
      });
      const onStageMarks = onStageIndividual.reduce((sum, r) => sum + r.totalMark, 0) + 
                            onStageGroup.reduce((sum, r) => sum + r.totalMark, 0);
      
      // Off-stage subtotals
      const offStageIndividual = individualResults.filter(r => {
        const comp = db.competitions.find(c => c.id === r.competitionId);
        return comp && comp.stageType === StageType.OFF_STAGE;
      });
      const offStageGroup = groupResults.filter(r => {
        const comp = db.competitions.find(c => c.id === r.competitionId);
        return comp && comp.stageType === StageType.OFF_STAGE;
      });
      const offStageMarks = offStageIndividual.reduce((sum, r) => sum + r.totalMark, 0) + 
                             offStageGroup.reduce((sum, r) => sum + r.totalMark, 0);
      
      // Overall totals
      const overallMarks = onStageMarks + offStageMarks;
      const completedResultsCount = individualResults.length + groupResults.length;
      
      // Calculate placement counts (Rank 1, Rank 2, Rank 3)
      let firstPlaceCount = 0;
      let secondPlaceCount = 0;
      let thirdPlaceCount = 0;
      
      const countPlacements = (resultsList: Result[]) => {
        resultsList.forEach(r => {
          if (r.rank === 1) firstPlaceCount++;
          else if (r.rank === 2) secondPlaceCount++;
          else if (r.rank === 3) thirdPlaceCount++;
        });
      };
      
      countPlacements(individualResults);
      countPlacements(groupResults);
      
      // Calculate official points: 1st place = 5pts, 2nd = 3pts, 3rd = 1pt
      const overallPoints = (firstPlaceCount * 5) + (secondPlaceCount * 3) + (thirdPlaceCount * 1);
      
      // Compute Category Breakdown
      const categoryBreakdown = db.categories.map(cat => {
        // count of participants in this category for this unit
        const count = participants.filter(p => p.selectedCategoryId === cat.id).length;
        
        // results for this category
        const catResults = [...individualResults, ...groupResults].filter(r => r.categoryId === cat.id);
        const marks = catResults.reduce((sum, r) => sum + r.totalMark, 0);
        
        let points = 0;
        catResults.forEach(r => {
          if (r.rank === 1) points += 5;
          else if (r.rank === 2) points += 3;
          else if (r.rank === 3) points += 1;
        });
        
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          count,
          marks,
          points
        };
      }).filter(b => b.count > 0 || b.marks > 0);
      
      return {
        unitId: unit.id,
        unitName: unit.name,
        unitCode: unit.code,
        totalParticipants: participants.length,
        completedResultsCount,
        onStageMarks,
        offStageMarks,
        overallMarks,
        overallPoints,
        firstPlaceCount,
        secondPlaceCount,
        thirdPlaceCount,
        categoryBreakdown
      };
    });
    
    // Sort units: highest official points first, raw marks as tiebreaker
    unitStandings.sort((a, b) => {
      if (b.overallPoints !== a.overallPoints) return b.overallPoints - a.overallPoints;
      return b.overallMarks - a.overallMarks;
    });
    
    // Assign ranks
    let currentRank = 1;
    const finalStandings = unitStandings.map((standing, index) => {
      if (index > 0 && unitStandings[index].overallMarks < unitStandings[index - 1].overallMarks) {
        currentRank = index + 1;
      }
      return {
        ...standing,
        rank: currentRank
      };
    });
    
    return finalStandings;
  }
};
