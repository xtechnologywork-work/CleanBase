import { installDict, resetDict } from '../../services/dashTranslate';
import common from './common';
import bookings from './bookings';
import clients from './clients';
import ops from './ops';
import subscriptions from './subscriptions';
import money from './money';
import team from './team';
import insights from './insights';
import misc from './misc';
import extra from './extra';

/** Loads the Arabic dictionary of the company dashboard. Every page adds its own file. */
export function installArabic() {
    resetDict();
    installDict(common);
    installDict(bookings);
    installDict(clients);
    installDict(ops);
    installDict(subscriptions);
    installDict(money);
    installDict(team);
    installDict(insights);
    installDict(misc);
    installDict(extra);
}
