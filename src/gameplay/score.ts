/** Goals, shots and the current run of goals in a row. */
export class Score {
  goals = 0;
  shots = 0;
  streak = 0;

  record(goal: boolean) {
    this.shots++;
    if (goal) {
      this.goals++;
      this.streak++;
    } else {
      this.streak = 0;
    }
  }
}
